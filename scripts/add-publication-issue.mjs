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
 *      archive page onto the next so every page keeps the live site's length,
 *      and puts it at the top of every "Recent Posts" sidebar;
 *   5. records it in src/data/publication-issues.json, which the tests check,
 *      and pins the new cover's hash in __tests__/assets/media-rendered.json; and
 *   6. publishes the PDF as its own release, `publication-<slug>`, since issue
 *      PDFs are too large for GitHub Pages to serve (#51). Releases in this
 *      repo are immutable, so each is created with its PDF attached.
 *
 * Every change is computed and checked before any file is written, and the
 * release is published last, so a failure leaves neither partial files nor
 * anything public behind, and the same command can simply be retried.
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
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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

function upload(pdf, slug, title, asset) {
  const named = join(mkdtempSync(join(tmpdir(), 'issue-')), asset)
  copyFileSync(pdf, named)
  // Passing the file to `create` uploads it before the release is published.
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

/** The archive pages in order: /publications/books/, then /books/page/2/ and on. */
function listingPages() {
  const numbered = readdirSync(join(BOOKS, 'page'))
    .map((f) => Number(f.match(/^(\d+)\.html$/)?.[1]))
    .filter(Boolean)
    .sort((a, b) => a - b)
  return [
    join(CONTENT, 'publications/books.html'),
    ...numbered.map((n) => join(BOOKS, 'page', `${n}.html`)),
  ]
}

/** Each card on an archive page, with where it sits in the page's HTML. */
const CARD = /<article\nclass="[^"]*"[\s\S]*?<\/article><!-- #post-[^ ]+ -->\n/g

function cardsOf(html, file) {
  const cards = [...html.matchAll(CARD)]
  if (!cards.length) throw new Error(`${file}: no archive cards found`)
  const start = cards[0].index
  const end = cards.at(-1).index + cards.at(-1)[0].length
  if (cards.map((m) => m[0]).join('') !== html.slice(start, end)) {
    throw new Error(`${file}: archive cards are not contiguous`)
  }
  return { cards: cards.map((m) => m[0]), start, end }
}

/**
 * Archive page changes. A new issue goes first on page 1 and each full page
 * passes its last card to the next, so every page keeps the live site's
 * length. An issue already listed is updated where it is, so regenerating an
 * older issue never moves it above newer ones.
 */
function listingChanges(slug, title, date) {
  const card = listingArticle(slug, title, date)
  const pages = listingPages().map((file) => {
    const html = readFileSync(file, 'utf8')
    return { file, html, ...cardsOf(html, file) }
  })
  const mine = (c) => c.startsWith(`<article\nclass="${slug} `)
  const listed = pages.find((p) => p.cards.some(mine))
  if (listed) {
    listed.cards = listed.cards.map((c) => (mine(c) ? card : c))
  } else {
    const perPage = pages[0].cards.length
    let carry = card
    for (const [i, page] of pages.entries()) {
      page.cards.unshift(carry)
      carry = page.cards.length > perPage ? page.cards.pop() : null
      if (!carry) break
      if (i === pages.length - 1) {
        throw new Error(
          `the last archive page is full; /publications/books/page/${pages.length + 1}/ must be added first`
        )
      }
    }
  }
  return {
    added: !listed,
    changes: pages.map((p) => [
      p.file,
      p.html.slice(0, p.start) + p.cards.join('') + p.html.slice(p.end),
    ]),
  }
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
  for (const file of htmlFiles(CONTENT)) {
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

if (import.meta.url === `file://${process.argv[1]}`) {
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
  const isPublished = releaseExists(slug)
  if (isPublished && !prior) {
    throw new Error(`release ${releaseTag(slug)} exists but is not recorded; choose a new slug`)
  }

  // ---- Prepare the PDF and cover in a work directory.
  const work = mkdtempSync(join(tmpdir(), 'issue-'))
  let file, sourceBytes, sourceSha256
  if (isPublished) {
    // A published release can't change, so its pages are rebuilt from the exact
    // file it holds (Ghostscript output differs run to run, so the source PDF
    // can't be recompressed into it). A --pdf given must be that file or its source.
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
  for (const [f, data] of writes) {
    mkdirSync(dirname(f), { recursive: true })
    writeFileSync(f, data)
  }
  if (!isPublished && !values['skip-upload']) upload(file, slug, title, asset)

  const mb = (n) => `${(n / 1e6).toFixed(1)} MB`
  console.log(
    `Added ${title}: ${mb(sourceBytes)} -> ${mb(bytes)}; ${sidebars.length} sidebars updated.`
  )
  console.log(url)
  if (!isPublished && values['skip-upload'])
    console.log(`Not published. Release ${releaseTag(slug)} must carry ${file} as ${asset}.`)
}
