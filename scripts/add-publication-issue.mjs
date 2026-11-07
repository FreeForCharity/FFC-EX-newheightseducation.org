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
 *   3. publishes the PDF as its own release, `publication-<slug>`, since issue
 *      PDFs are too large for GitHub Pages to serve (#51). Releases in this
 *      repo are immutable, so each issue's release is created with its PDF
 *      attached and never changed afterwards;
 *   4. writes the issue page, cloned from the newest captured issue page;
 *   5. lists it first on /publications/books/ and at the top of every
 *      "Recent Posts" sidebar; and
 *   6. records it in src/data/publication-issues.json, which the tests check,
 *      and pins the new cover's hash in __tests__/assets/media-rendered.json.
 *
 * Every local step runs before the release is published, so a failure leaves
 * nothing public behind.
 *
 * Requires `gs`, `pdfinfo`, `pdftoppm`, `cwebp` and an authenticated `gh`.
 * Re-running with the same slug rebuilds that issue's pages from the PDF on its
 * release (--pdf is then optional) rather than adding it twice. Releases are
 * never changed, so a corrected PDF needs a new slug. --skip-upload does
 * everything except publishing a new issue's release.
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
import { join } from 'node:path'
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

function renderCover(pdf, slug, dir) {
  const png = join(dir, 'cover')
  run('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', '600', '-png', pdf, png])
  const path = `${THUMBS}/${slug}.webp`
  run('cwebp', [
    '-quiet',
    '-q',
    '80',
    '-resize',
    '600',
    '0',
    `${png}.png`,
    '-o',
    join(ROOT, 'public', path),
  ])
  const [width, height] = imageSize(join(ROOT, 'public', path))
  return { path, width, height }
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
  const tag = releaseTag(slug)
  const named = join(mkdtempSync(join(tmpdir(), 'issue-')), asset)
  copyFileSync(pdf, named)
  // Passing the file to `create` uploads it before the release is published.
  run('gh', [
    'release',
    'create',
    tag,
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
function writePageTsx(slug, title) {
  const tsx = readFileSync(join(APP_BOOKS, TEMPLATE, 'page.tsx'), 'utf8')
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
  mkdirSync(join(APP_BOOKS, slug), { recursive: true })
  writeFileSync(join(APP_BOOKS, slug, 'page.tsx'), tsx)
}

const FLIPBOOK = /<figure class="ffc-flipbook">[\s\S]*?<\/figure>/

function writeContent(slug, title, figure) {
  let html = readFileSync(join(BOOKS, `${TEMPLATE}.html`), 'utf8')
  if (!FLIPBOOK.test(html)) throw new Error(`no flipbook in ${TEMPLATE}`)
  html = html
    .replace(
      /^<h1 class="ffc-sr-only">[^<]*<\/h1>/,
      () => `<h1 class="ffc-sr-only">${escapeHtml(title)} - NHEG</h1>`
    )
    .replace(FLIPBOOK, () => figure)
  writeFileSync(join(BOOKS, `${slug}.html`), html)
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

/** Lists the issue first on /publications/books/ (page 1 gains one card). */
function addToListing(slug, title, date) {
  const file = join(CONTENT, 'publications/books.html')
  const own = new RegExp(`<article\\nclass="${slug} [\\s\\S]*?</article><!-- #post-${slug} -->\\n`)
  let html = readFileSync(file, 'utf8').replace(own, '')
  const anchor = '<div class="ast-row"><article\n'
  if (!html.includes(anchor)) throw new Error('books.html: listing anchor not found')
  html = html.replace(
    anchor,
    () => `<div class="ast-row">${listingArticle(slug, title, date)}<article\n`
  )
  writeFileSync(file, html)
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

/** Puts the issue at the top of every "Recent Posts" sidebar, keeping its length. */
function addToRecentPosts(slug, title) {
  const href = `%%BASE%%/publications/books/${slug}/`
  const item = `<li><a class="wp-block-latest-posts__post-title" href="${href}">${listingTitle(title)}</a></li>`
  let changed = 0
  for (const file of htmlFiles(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = html.replace(RECENT, (_, open, body, close) => {
      const items = body.match(/<li>[\s\S]*?<\/li>/g) ?? []
      const tail = body.slice(body.lastIndexOf('</li>') + 5)
      const others = items.filter((li) => !li.includes(`href="${href}"`))
      return open + [item, ...others].slice(0, items.length).join('') + tail + close
    })
    if (next !== html) {
      writeFileSync(file, next)
      changed++
    }
  }
  return changed
}

function record(entry) {
  const list = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : []
  const next = [entry, ...list.filter((e) => e.slug !== entry.slug)]
  writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n')
}

/** Pins only this issue's cover, so unrelated media changes still fail review. */
function pinCover(cover) {
  const pins = JSON.parse(readFileSync(PINS, 'utf8'))
  const key = cover.path.replace(/^_ffc-assets\//, '')
  const sha256 = createHash('sha256')
    .update(readFileSync(join(ROOT, 'public', cover.path)))
    .digest('hex')
  pins[key] = { sha256, source: null }
  const sorted = Object.fromEntries(
    Object.keys(pins)
      .sort()
      .map((k) => [k, pins[k]])
  )
  writeFileSync(PINS, JSON.stringify(sorted, null, 2) + '\n')
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
    existsSync(join(BOOKS, `${slug}.html`)) || existsSync(join(APP_BOOKS, slug, 'page.tsx'))
  if (taken && !prior) {
    throw new Error(`${slug} is an archived issue page; choose a new slug`)
  }
  const isPublished = releaseExists(slug)
  if (isPublished && !prior) {
    throw new Error(`release ${releaseTag(slug)} exists but is not recorded; choose a new slug`)
  }

  const work = mkdtempSync(join(tmpdir(), 'issue-'))
  const hashOf = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')
  let file, sourceBytes, sourceSha256
  if (isPublished) {
    // A published release can't change, so its pages are rebuilt from the exact
    // file it holds (Ghostscript output differs run to run, so the source PDF
    // can't be recompressed into it). A --pdf given must be that file or its source.
    if (pdf) {
      const given = hashOf(pdf)
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
    if (hashOf(file) !== prior.sha256) {
      throw new Error(`${prior.url} does not match the sha256 recorded for ${slug}`)
    }
    ;({ sourceBytes, sourceSha256 } = prior)
  } else {
    if (!pdf) throw new Error(`--pdf is required: ${slug} has no published release yet`)
    sourceBytes = statSync(pdf).size
    sourceSha256 = hashOf(pdf)
    file = compress(pdf, work)
  }
  const bytes = statSync(file).size
  const sha256 = hashOf(file)
  const asset = prior?.asset ?? assetName(title)
  const url = releaseUrl(slug, asset)
  const cover = renderCover(file, slug, work)
  pinCover(cover)

  const published = longDate(date)
  writePageTsx(slug, title)
  writeContent(slug, title, flipbookMarkup({ title, href: url, local: false, bytes, cover }))
  addToListing(slug, title, published)
  const sidebars = addToRecentPosts(slug, title)
  record({
    slug,
    title,
    date: published,
    asset,
    url,
    bytes,
    sha256,
    pages: pageCount(file),
    sourceBytes,
    sourceSha256,
    cover: cover.path,
  })
  // Last, so any failure above leaves nothing public behind.
  if (!isPublished && !values['skip-upload']) upload(file, slug, title, asset)

  const mb = (n) => `${(n / 1e6).toFixed(1)} MB`
  console.log(`Added ${title}: ${mb(sourceBytes)} -> ${mb(bytes)}; ${sidebars} sidebars updated.`)
  console.log(url)
  if (!isPublished && values['skip-upload'])
    console.log(`Not published. Release ${releaseTag(slug)} must carry ${file} as ${asset}.`)
}
