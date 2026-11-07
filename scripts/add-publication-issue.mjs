#!/usr/bin/env node
/**
 * Adds a new publications issue (an EDGuide magazine or E.A.S.Y.Toons comic)
 * to the site. The 2026-10-02 capture froze the WordPress site, so there is no
 * upload screen: each new issue goes through this script instead.
 *
 *   node scripts/add-publication-issue.mjs \
 *     --pdf ~/Downloads/NHEG-November-December-2026.pdf \
 *     --slug nheg-edguide-november-december-2026 \
 *     --title "NHEG EDGuide November - December 2026" \
 *     --date 2026-11-06
 *
 * It:
 *   1. compresses the PDF with Ghostscript (`/ebook`, RGB) when it is large,
 *      keeping whichever file is smaller;
 *   2. renders page 1 to a 600 px wide WebP cover in dflip-thumbs/;
 *   3. writes the issue page, cloned from the newest captured issue page;
 *   4. lists it first on /publications/books/, shifting one card from each
 *      archive page onto the next so every page keeps the live site's length
 *      (adding /page/N+1/ when the last page overflows, and keeping every
 *      page's pagination control, title and description in step), and puts it
 *      at the top of every "Recent Posts" sidebar;
 *   5. records it in src/data/publication-issues.json, which the tests check,
 *      and pins the new cover's hash in __tests__/assets/media-rendered.json; and
 *   6. publishes the PDF as its own release, `publication-<slug>`, since issue
 *      PDFs are too large for GitHub Pages to serve (#51). Releases in this
 *      repo are immutable, so each is created with its PDF attached.
 *
 * Every change is computed and checked before any file is written. Files are
 * then written and the release published last; if either fails, every file is
 * restored and an unpublished draft release is deleted, so the repository is
 * left as it was and the same command can simply be retried.
 *
 * Requires `gs`, `pdfinfo`, `pdftoppm`, `cwebp` and an authenticated `gh`.
 * Re-running with the same slug rebuilds that issue's pages in place from the
 * PDF on its release (--pdf is then optional) rather than adding it twice.
 * Releases are never changed, so a corrected PDF needs a new slug.
 * --skip-upload does everything except publishing a new issue's release.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { flipbookMarkup } from './static-flipbooks.mjs'
import { imageSize } from './image-size.mjs'
import { PINS } from './pin-rendered-media.mjs'

const ROOT = join(import.meta.dirname, '..')
const REPO = 'FreeForCharity/FFC-EX-newheightseducation.org'
const CONTENT = join(ROOT, 'src/clone-content')
const BOOKS = join(CONTENT, 'publications/books')
const APP_BOOKS = join(ROOT, 'src/app/publications/books')
const THUMBS = '_ffc-assets/publications.newheightseducation.org/wp-content/uploads/dflip-thumbs'
const MANIFEST = join(ROOT, 'src/data/publication-issues.json')
const releaseTag = (slug) => `publication-${slug}`
/** The newest captured issue; every added page is cloned from its markup. */
const TEMPLATE = 'nheg-edguide-september-october-2026'
/** PDFs at or below this size are already compact enough to leave alone. */
const COMPRESS_ABOVE = 15e6

const releaseUrl = (slug, asset) =>
  `https://github.com/${REPO}/releases/download/${releaseTag(slug)}/${asset}`
/** "NHEG EDGuide November - December 2026" -> "NHEG-EDGuide-November-December-2026.pdf" */
const assetName = (title) => `${title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`
const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Listings render " - " in titles as an en dash entity, as WordPress did. */
const listingTitle = (title) => escapeHtml(title).replace(/ - /g, ' &#8211; ')
const tsString = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const longDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
const hashOf = (buf) => createHash('sha256').update(buf).digest('hex')

const run = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

function compress(src, dir) {
  if (statSync(src).size <= COMPRESS_ABOVE) return src
  const out = join(dir, 'compressed.pdf')
  run('gs', [
    '-q',
    '-dNOPAUSE',
    '-dBATCH',
    '-dSAFER',
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.6',
    '-dPDFSETTINGS=/ebook',
    '-sColorConversionStrategy=RGB',
    '-dDetectDuplicateImages=true',
    `-sOutputFile=${out}`,
    src,
  ])
  return statSync(out).size < statSync(src).size ? out : src
}

const pageCount = (pdf) => Number(run('pdfinfo', [pdf]).match(/^Pages:\s+(\d+)/m)[1])

/** Renders the cover into the work directory; it is copied into public/ with the other writes. */
function renderCover(pdf, slug, dir) {
  const png = join(dir, 'cover')
  const webp = join(dir, 'cover.webp')
  run('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '600', '-png', pdf, png])
  run('cwebp', ['-quiet', '-q', '80', '-resize', '600', '0', `${png}.png`, '-o', webp])
  const [width, height] = imageSize(webp)
  return { path: `${THUMBS}/${slug}.webp`, width, height, data: readFileSync(webp) }
}

/** Only a definite "not found" counts as absent; any other gh failure stops the run. */
function releaseExists(slug) {
  try {
    run('gh', ['release', 'view', releaseTag(slug), '--repo', REPO])
    return true
  } catch (err) {
    if (/release not found/i.test(String(err.stderr))) return false
    throw new Error(`could not check release ${releaseTag(slug)}: ${String(err.stderr).trim()}`)
  }
}

/** The release's draft state and asset digests, or null when there is none. */
function releaseState(slug) {
  if (!releaseExists(slug)) return null
  const out = run('gh', [
    'release',
    'view',
    releaseTag(slug),
    '--repo',
    REPO,
    '--json',
    'isDraft,assets',
  ])
  const { isDraft, assets } = JSON.parse(out)
  return { isDraft, digests: Object.fromEntries(assets.map((a) => [a.name, a.digest ?? null])) }
}

/**
 * Publishes the issue's release with its PDF. `gh release create` uploads to a
 * draft and then publishes it; if it fails part way, a draft (never public) is
 * deleted so the run can be retried, while a release that did get published
 * with the right file counts as success.
 */
function upload(pdf, slug, title, asset, sha256) {
  const named = join(mkdtempSync(join(tmpdir(), 'issue-')), asset)
  copyFileSync(pdf, named)
  try {
    run('gh', [
      'release',
      'create',
      releaseTag(slug),
      named,
      '--repo',
      REPO,
      '--title',
      `${title} (PDF)`,
      '--notes',
      `PDF for ${title}, added with scripts/add-publication-issue.mjs.`,
      '--latest=false',
    ])
  } catch (err) {
    const state = releaseState(slug)
    if (state && !state.isDraft && state.digests[asset] === `sha256:${sha256}`) return
    if (state?.isDraft) {
      run('gh', ['release', 'delete', releaseTag(slug), '--repo', REPO, '--yes', '--cleanup-tag'])
    } else if (state) {
      throw new Error(
        `release ${releaseTag(slug)} was published without ${asset} as expected; fix it by hand before retrying (${String(err.stderr ?? err.message).trim()})`
      )
    }
    throw new Error(
      `publishing ${releaseTag(slug)} failed: ${String(err.stderr ?? err.message).trim()}`
    )
  }
}

/**
 * Writes every file, then runs `publish`. If anything fails, each file is put
 * back as it was and directories this run created are removed, so the
 * repository is left exactly as before and the same command can be retried.
 */
function applyWrites(writes, publish) {
  const before = new Map([...writes.keys()].map((f) => [f, existsSync(f) ? readFileSync(f) : null]))
  const written = []
  const created = []
  try {
    for (const [f, data] of writes) {
      let dir = dirname(f)
      let top = null
      while (!existsSync(dir)) {
        top = dir
        dir = dirname(dir)
      }
      if (top) created.push(top)
      mkdirSync(dirname(f), { recursive: true })
      // Recorded first: a write that fails part way may still have changed the file.
      written.push(f)
      writeFileSync(f, data)
    }
    publish()
  } catch (err) {
    // Undo every step even if one fails, then report what could not be undone.
    const stuck = []
    const attempt = (what, fn) => {
      try {
        fn()
      } catch (e) {
        stuck.push(`${what}: ${e.message}`)
      }
    }
    for (const f of written.reverse()) {
      const data = before.get(f)
      const unchanged = data !== null && existsSync(f) && readFileSync(f).equals(data)
      if (!unchanged) {
        attempt(f, () => (data === null ? rmSync(f, { force: true }) : writeFileSync(f, data)))
      }
    }
    for (const dir of created.reverse()) {
      attempt(dir, () => rmSync(dir, { recursive: true, force: true }))
    }
    if (stuck.length) {
      err.message += `\nCould not undo:\n  ${stuck.join('\n  ')}\nRestore these by hand (git checkout / git clean) before retrying.`
    }
    throw err
  }
}

/** The template issue's page component with only the issue's identity swapped. */
function pageTsx(slug, title) {
  return (
    readFileSync(join(APP_BOOKS, TEMPLATE, 'page.tsx'), 'utf8')
      .replace(
        /\/\/ Generated by workflow 706[^\n]*\n\/\/[^\n]*\n/,
        '// Added after the capture by scripts/add-publication-issue.mjs. Re-run that\n// script to change this issue rather than editing this file.\n'
      )
      // Callbacks keep `$&`-style sequences in the title literal.
      .replace(/title: '[^']*',/, () => `title: '${tsString(title)} - NHEG',`)
      .replace(/description: '[^']*',/, () => `description: '${tsString(title)}',`)
      .replace(/canonical: '[^']*',/, () => `canonical: '/publications/books/${slug}/',`)
      .replace(
        /title: \{ absolute: '[^']*' \}/,
        () => `title: { absolute: '${tsString(title)} - NHEG' }`
      )
      .replace(/ postid-\d+/, '')
      .replaceAll(`publications/books/${TEMPLATE}`, `publications/books/${slug}`)
  )
}

const FLIPBOOK = /<figure class="ffc-flipbook">[\s\S]*?<\/figure>/

function contentHtml(title, figure) {
  const html = readFileSync(join(BOOKS, `${TEMPLATE}.html`), 'utf8')
  if (!FLIPBOOK.test(html)) throw new Error(`no flipbook in ${TEMPLATE}`)
  return html
    .replace(
      /^<h1 class="ffc-sr-only">[^<]*<\/h1>/,
      () => `<h1 class="ffc-sr-only">${escapeHtml(title)} - NHEG</h1>`
    )
    .replace(FLIPBOOK, () => figure)
}

/** One archive card, matching the captured listing markup. */
function listingArticle(slug, title, date) {
  const href = `%%BASE%%/publications/books/${slug}/`
  const t = listingTitle(title)
  return `<article
class="${slug} dflip type-dflip status-publish hentry ast-grid-common-col ast-full-width ast-article-post remove-featured-img-padding" id="post-${slug}" itemtype="https://schema.org/CreativeWork" itemscope="itemscope">
		<div class="ast-post-format- ast-no-thumb blog-layout-4 ast-article-inner">
	<div class="post-content ast-grid-common-col" >
		<div class="ast-blog-featured-section post-thumb ast-blog-single-element"></div><h2 class="entry-title ast-blog-single-element" itemprop="headline"><a href="${href}" rel="bookmark">${t}</a></h2>		<header class="entry-header ast-blog-single-element ast-blog-meta-container">
			<div class="entry-meta"><span class="posted-on"><span class="published" itemprop="datePublished"> ${date} </span></span></div>		</header><!-- .entry-header -->
					<div class="ast-excerpt-container ast-blog-single-element">
							</div>
		<p class="ast-blog-single-element ast-read-more-container read-more"> <a class="" href="${href}"> <span class="screen-reader-text">${t}</span> Read More »</a></p>		<div class="entry-content clear"
		itemprop="text"		>
					</div><!-- .entry-content .clear -->
	</div><!-- .post-content -->
</div> <!-- .blog-layout-4 -->
</article><!-- #post-${slug} -->
`
}

const ARCHIVE = 'publications/books'
const pageHtmlFile = (n) =>
  n === 1 ? join(CONTENT, `${ARCHIVE}.html`) : join(BOOKS, 'page', `${n}.html`)
const pageTsxFile = (n) =>
  n === 1 ? join(APP_BOOKS, 'page.tsx') : join(APP_BOOKS, 'page', String(n), 'page.tsx')
const pageHref = (n) => (n === 1 ? `%%BASE%%/${ARCHIVE}/` : `%%BASE%%/${ARCHIVE}/page/${n}/`)

/** How many archive pages there are: /publications/books/, then /page/2/ to /page/N/. */
function archivePageCount() {
  const numbered = readdirSync(join(BOOKS, 'page'))
    .map((f) => Number(f.match(/^(\d+)\.html$/)?.[1]))
    .filter(Boolean)
    .sort((a, b) => a - b)
  if (numbered.some((n, i) => n !== i + 2)) throw new Error('archive pages are not numbered 2..N')
  return numbered.length + 1
}

/**
 * Astra's archive control as WordPress's paginate_links renders it, one page
 * either side of the current one. It reproduces every captured control.
 */
export function astraControl(n, max) {
  const out = []
  if (n > 1) {
    out.push(
      `<a class="prev page-numbers" aria-label="Previous page" href="${pageHref(n - 1)}"><span class="ast-left-arrow" aria-hidden="true">&larr;</span> Previous</a>`
    )
  }
  let dots = false
  for (let i = 1; i <= max; i++) {
    if (i === n) {
      out.push(`<span aria-current="page" class="page-numbers current">${i}</span>`)
      dots = true
    } else if (i === 1 || i === max || Math.abs(i - n) <= 1) {
      out.push(`<a class="page-numbers" href="${pageHref(i)}">${i}</a>`)
      dots = true
    } else if (dots) {
      out.push('<span class="page-numbers dots">&hellip;</span>')
      dots = false
    }
  }
  if (n < max) {
    out.push(
      `<a class="next page-numbers" aria-label="Next page" href="${pageHref(n + 1)}">Next <span class="ast-right-arrow" aria-hidden="true">&rarr;</span></a>`
    )
  }
  return `<div class='ast-pagination'><nav class="navigation pagination" aria-label="Post pagination">\n\t\t\t\t<div class="nav-links">${out.join('\n')}</div>\n\t\t</nav></div>`
}
const ASTRA_CONTROL = /<div class='ast-pagination'>[\s\S]*?<\/nav><\/div>/

const ENTITY = { amp: '&', quot: '"', hellip: '…' }
const decodeEntities = (s) =>
  s.replace(/&(#\d+|amp|quot|hellip);/g, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : (ENTITY[e] ?? m)
  )

/**
 * An archive page's meta description, listing the issues it shows, in the
 * wording paginate-archives.mjs gave pages 2..N. Page 1 keeps the capture's
 * wording, which has no "page 1 of N". It reproduces every captured description.
 */
export function archiveDescription(cards, n, max) {
  const titles = cards.map((c) => {
    const h2 = c.match(/<h2 class="entry-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/)
    return decodeEntities(h2[1].replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim()
  })
  const listed = [...new Set(titles.map((t) => t.replace(/[.!?\s]+$/, '')))].join(', ')
  let text =
    n === 1
      ? `dFlip Book Archive: ${listed}.`
      : `dFlip Book Archive, page ${n} of ${max}: ${listed}.`
  if (text.length > 155) text = `${text.slice(0, 154).replace(/[\s,]+\S*$/, '')}…`
  return text
}

/** Each card on an archive page, with where it sits in the page's HTML. */
const CARD = /<article\nclass="[^"]*"[\s\S]*?<\/article><!-- #post-[^ ]+ -->\n/g

export function cardsOf(html, file) {
  const cards = [...html.matchAll(CARD)]
  if (!cards.length) throw new Error(`${file}: no archive cards found`)
  const start = cards[0].index
  const end = cards.at(-1).index + cards.at(-1)[0].length
  if (cards.map((m) => m[0]).join('') !== html.slice(start, end)) {
    throw new Error(`${file}: archive cards are not contiguous`)
  }
  return { cards: cards.map((m) => m[0]), start, end }
}

const tsLiteral = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** An archive page component with its page number, page count and description set. */
export function archiveTsx(tsx, n, max, description) {
  const out = tsx
    .replace(
      /description:\s*'(?:[^'\\]|\\.)*',/,
      () => `description:\n      ${tsLiteral(description)},`
    )
    .replace(/Page \d+ of \d+/g, `Page ${n} of ${max}`)
  if (n === 1) return out
  return out
    .replace(/canonical: '[^']*'/, `canonical: '/${ARCHIVE}/page/${n}/'`)
    .replace(/ paged paged-\d+/, ` paged paged-${n}`)
    .replace(/loadCloneContent\('[^']*'\)/, `loadCloneContent('${ARCHIVE}/page/${n}')`)
}

/**
 * Archive page changes. A new issue goes first on page 1 and each full page
 * passes its last card to the next, so every page keeps the live site's
 * length; when the last page overflows, the next page is created from it. An
 * issue already listed is updated where it is, so regenerating an older issue
 * never moves it above newer ones. Every page's control, title and description
 * is then made to match its cards and the page count.
 */
function listingChanges(slug, title, date) {
  const card = listingArticle(slug, title, date)
  const pages = Array.from({ length: archivePageCount() }, (_, i) => {
    const n = i + 1
    const html = readFileSync(pageHtmlFile(n), 'utf8')
    if (!ASTRA_CONTROL.test(html)) throw new Error(`${pageHtmlFile(n)}: no pagination control`)
    return { n, html, tsx: readFileSync(pageTsxFile(n), 'utf8'), ...cardsOf(html, pageHtmlFile(n)) }
  })
  const mine = (c) => c.startsWith(`<article\nclass="${slug} `)
  const listed = pages.find((p) => p.cards.some(mine))
  if (listed) {
    listed.cards = listed.cards.map((c) => (mine(c) ? card : c))
  } else {
    const perPage = pages[0].cards.length
    let carry = card
    for (let i = 0; carry; i++) {
      if (i === pages.length) {
        // The next page starts as a copy of the last, holding only the overflow.
        const last = pages.at(-1)
        pages.push({ ...last, n: last.n + 1, cards: [] })
      }
      pages[i].cards.unshift(carry)
      carry = pages[i].cards.length > perPage ? pages[i].cards.pop() : null
    }
  }
  const max = pages.length
  const changes = []
  for (const p of pages) {
    const html = (p.html.slice(0, p.start) + p.cards.join('') + p.html.slice(p.end)).replace(
      ASTRA_CONTROL,
      () => astraControl(p.n, max)
    )
    changes.push([pageHtmlFile(p.n), html])
    changes.push([
      pageTsxFile(p.n),
      archiveTsx(p.tsx, p.n, max, archiveDescription(p.cards, p.n, max)),
    ])
  }
  return { added: !listed, changes }
}

const RECENT = /(Recent Posts<\/h2><ul class="wp-block-latest-posts__list[^"]*">)([\s\S]*?)(<\/ul>)/

const htmlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? htmlFiles(join(dir, e.name))
      : e.name.endsWith('.html')
        ? [join(dir, e.name)]
        : []
  )

/**
 * "Recent Posts" sidebar changes. A new issue goes at the top of every sidebar,
 * keeping its length. For an issue already listed (`isNew` false) an entry is only
 * updated in place, so an older issue never displaces newer ones or returns
 * once it has dropped off.
 */
function sidebarChanges(slug, title, isNew, pending) {
  const href = `%%BASE%%/publications/books/${slug}/`
  const item = `<li><a class="wp-block-latest-posts__post-title" href="${href}">${listingTitle(title)}</a></li>`
  const mine = (li) => li.includes(`href="${href}"`)
  const changes = []
  // Pending writes include pages this run creates, such as a new /page/N/.
  const files = new Set([
    ...htmlFiles(CONTENT),
    ...[...pending.keys()].filter((f) => f.startsWith(CONTENT) && f.endsWith('.html')),
  ])
  for (const file of files) {
    const html = pending.get(file) ?? readFileSync(file, 'utf8')
    const next = html.replace(RECENT, (_, open, body, close) => {
      const items = body.match(/<li>[\s\S]*?<\/li>/g) ?? []
      const tail = body.slice(body.lastIndexOf('</li>') + 5)
      const list = isNew
        ? [item, ...items.filter((li) => !mine(li))].slice(0, items.length)
        : items.map((li) => (mine(li) ? item : li))
      return open + list.join('') + tail + close
    })
    if (next !== html) changes.push([file, next])
  }
  return changes
}

function manifestWith(entry) {
  const list = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : []
  const at = list.findIndex((e) => e.slug === entry.slug)
  const next = at < 0 ? [entry, ...list] : list.map((e, i) => (i === at ? entry : e))
  return JSON.stringify(next, null, 2) + '\n'
}

/** Pins only this issue's cover, so unrelated media changes still fail review. */
function pinsWith(cover) {
  const pins = JSON.parse(readFileSync(PINS, 'utf8'))
  pins[cover.path.replace(/^_ffc-assets\//, '')] = { sha256: hashOf(cover.data), source: null }
  const sorted = Object.fromEntries(
    Object.keys(pins)
      .sort()
      .map((k) => [k, pins[k]])
  )
  return JSON.stringify(sorted, null, 2) + '\n'
}

// Compared as resolved file URLs, so a checkout path with spaces or symlinks still runs.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (isMain) {
  const { values } = parseArgs({
    options: {
      pdf: { type: 'string' },
      slug: { type: 'string' },
      title: { type: 'string' },
      date: { type: 'string' },
      'skip-upload': { type: 'boolean', default: false },
    },
  })
  const { pdf, slug, title, date } = values
  if (!slug || !title || !date) {
    console.error(
      'usage: add-publication-issue.mjs [--pdf FILE] --slug SLUG --title TITLE --date YYYY-MM-DD [--skip-upload]\n' +
        '--pdf is required for a new issue; for one already published it is optional.'
    )
    process.exit(2)
  }

  // ---- Check the input. Nothing has been written yet.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`slug must be kebab-case: ${slug}`)
  // The round trip rejects dates that don't exist, such as 2026-02-31.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T12:00:00Z`)
  if (!parsed || isNaN(parsed) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`date must be a real YYYY-MM-DD date: ${date}`)
  }
  // One line of printable text; it lands in TSX string literals and HTML.
  if (!title.trim() || title !== title.trim() || /[\p{Cc}\p{Cf}]/u.test(title)) {
    throw new Error('title must be one non-empty line without leading/trailing spaces')
  }
  // Only issues this script added may be regenerated; archived pages are never overwritten.
  const prior = (existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : []).find(
    (e) => e.slug === slug
  )
  const taken =
    existsSync(join(BOOKS, `${slug}.html`)) ||
    existsSync(join(APP_BOOKS, slug, 'page.tsx')) ||
    existsSync(join(ROOT, 'public', THUMBS, `${slug}.webp`))
  if (taken && !prior) {
    throw new Error(`${slug} would overwrite an archived page or cover; choose a new slug`)
  }
  // `gh release view` also sees drafts, which visitors can't download from.
  const release = releaseState(slug)
  if (release && !prior) {
    throw new Error(`release ${releaseTag(slug)} exists but is not recorded; choose a new slug`)
  }
  const isPublished = Boolean(release && !release.isDraft)
  const isDraft = Boolean(release?.isDraft)
  if (isDraft && release.digests[prior.asset] !== `sha256:${prior.sha256}`) {
    throw new Error(
      `draft release ${releaseTag(slug)} does not hold the recorded ${prior.asset}; delete the draft (gh release delete ${releaseTag(slug)} --cleanup-tag) and rerun`
    )
  }

  // ---- Prepare the PDF and cover in a work directory.
  const work = mkdtempSync(join(tmpdir(), 'issue-'))
  let file, sourceBytes, sourceSha256
  if (release) {
    // A release's file is what the pages must describe: a published one can't
    // change, and a draft holding the recorded PDF is about to be published.
    // Ghostscript output differs run to run, so the source PDF can't be
    // recompressed into it. A --pdf given must be that file or its source.
    if (pdf) {
      const given = hashOf(readFileSync(pdf))
      if (given !== prior.sha256 && given !== prior.sourceSha256) {
        throw new Error(
          `${pdf} is neither the PDF published for ${slug} nor its source; use a new slug for a corrected PDF`
        )
      }
    }
    run('gh', [
      'release',
      'download',
      releaseTag(slug),
      '--repo',
      REPO,
      '--pattern',
      prior.asset,
      '--dir',
      work,
    ])
    file = join(work, prior.asset)
    if (hashOf(readFileSync(file)) !== prior.sha256) {
      throw new Error(`${prior.url} does not match the sha256 recorded for ${slug}`)
    }
    ;({ sourceBytes, sourceSha256 } = prior)
  } else {
    if (!pdf) throw new Error(`--pdf is required: ${slug} has no published release yet`)
    sourceBytes = statSync(pdf).size
    sourceSha256 = hashOf(readFileSync(pdf))
    file = compress(pdf, work)
  }
  const bytes = statSync(file).size
  const sha256 = hashOf(readFileSync(file))
  const asset = prior?.asset ?? assetName(title)
  const url = releaseUrl(slug, asset)
  const cover = renderCover(file, slug, work)
  const pages = pageCount(file)

  // ---- Compute every file change in memory; any failure here writes nothing.
  const published = longDate(date)
  const listing = listingChanges(slug, title, published)
  const writes = new Map([
    [join(ROOT, 'public', cover.path), cover.data],
    [join(APP_BOOKS, slug, 'page.tsx'), pageTsx(slug, title)],
    [
      join(BOOKS, `${slug}.html`),
      contentHtml(title, flipbookMarkup({ title, href: url, local: false, bytes, cover })),
    ],
    ...listing.changes,
  ])
  // An issue being added to the archive is new everywhere, sidebars included.
  const sidebars = sidebarChanges(slug, title, listing.added, writes)
  for (const [f, html] of sidebars) writes.set(f, html)
  writes.set(
    MANIFEST,
    manifestWith({
      slug,
      title,
      date: published,
      asset,
      url,
      bytes,
      sha256,
      pages,
      sourceBytes,
      sourceSha256,
      cover: cover.path,
    })
  )
  writes.set(PINS, pinsWith(cover))

  // ---- Write, then publish last so a failure leaves nothing public behind.
  applyWrites(writes, () => {
    if (values['skip-upload'] || isPublished) return
    if (isDraft) {
      run('gh', ['release', 'edit', releaseTag(slug), '--repo', REPO, '--draft=false'])
    } else {
      upload(file, slug, title, asset, sha256)
    }
  })

  const mb = (n) => `${(n / 1e6).toFixed(1)} MB`
  console.log(
    `Added ${title}: ${mb(sourceBytes)} -> ${mb(bytes)}; ${sidebars.length} sidebars updated.`
  )
  console.log(url)
  if (!isPublished && values['skip-upload'])
    console.log(`Not published. Release ${releaseTag(slug)} must carry ${file} as ${asset}.`)
}
