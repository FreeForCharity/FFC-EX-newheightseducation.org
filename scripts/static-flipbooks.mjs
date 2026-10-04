#!/usr/bin/env node
/**
 * Replaces each publications flipbook (#51) with its cover and a link to the
 * issue's PDF. dFlip rendered the magazine from a script the capture dropped,
 * leaving an empty box. The PDFs are 3.4 GB, more than Pages serves, so most
 * link to the `publications-pdfs-2026-10-04` release; the ones the site already
 * serves are linked locally. Safe to re-run.
 *
 *   node scripts/static-flipbooks.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const ARCHIVE = join(ROOT, 'docs', 'live-archive', '2026-10-02')
const THUMBS = '_ffc-assets/publications.newheightseducation.org/wp-content/uploads/dflip-thumbs'

export const FLIPBOOK =
  /<div class="_df_book[^"]*"[^>]*><\/div>|<figure class="ffc-flipbook">[\s\S]*?<\/figure>|<p class="ffc-flipbook-missing">[\s\S]*?<\/p>/

export const sizeLabel = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const slugOf = (page) => new URL(page).pathname.replace(/^\/books\/|\/$/g, '')

function titleOf(slug) {
  const tsx = readFileSync(join(ROOT, 'src/app/publications/books', slug, 'page.tsx'), 'utf8')
  const m = tsx.match(/title: \{ absolute: '((?:[^'\\]|\\.)*)' \}/)
  if (!m) throw new Error(`no title for ${slug}`)
  return m[1].replace(/\\(.)/g, '$1').replace(/ - NHEG$/, '')
}

function dimensions(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], {
    encoding: 'utf8',
  })
  return [/pixelWidth: (\d+)/, /pixelHeight: (\d+)/].map((re) => Number(out.match(re)[1]))
}

export function flipbookMarkup({ title, href, local, bytes, cover }) {
  if (!href) {
    return '<p class="ffc-flipbook-missing">The original site has no PDF for this issue. <a href="%%BASE%%/publications/contact/">Contact NHEG</a> if you need a copy.</p>'
  }
  const verb = local ? 'Read' : 'Download'
  const img = cover
    ? `<img src="%%BASE%%/${cover.path}" alt="" width="${cover.width}" height="${cover.height}" loading="lazy" decoding="async" />`
    : ''
  return `<figure class="ffc-flipbook"><a class="ffc-flipbook-link" href="${href}">${img}<span>${verb} ${escapeHtml(title)} (PDF, ${sizeLabel(bytes)})</span></a></figure>`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sources = JSON.parse(readFileSync(join(ARCHIVE, 'dflip-sources.json'), 'utf8'))
  const release = new Map(
    JSON.parse(readFileSync(join(ARCHIVE, 'publications-pdfs.json'), 'utf8')).map((r) => [
      r.page,
      r,
    ])
  )
  let changed = 0
  for (const book of sources) {
    const slug = slugOf(book.page)
    const file = join(ROOT, 'src/clone-content/publications/books', `${slug}.html`)
    const html = readFileSync(file, 'utf8')
    const id = book.option.split('_').pop()
    const coverPath = `${THUMBS}/${id}.webp`
    const coverFile = join(ROOT, 'public', coverPath)
    let cover = null
    if (existsSync(coverFile)) {
      const [width, height] = dimensions(coverFile)
      cover = { path: coverPath, width, height }
    }
    const local = Boolean(book.local && existsSync(join(ROOT, 'public', book.local)))
    const href = !book.source ? null : local ? `%%BASE%%/${book.local}` : release.get(book.page).url
    const markup = flipbookMarkup({ title: titleOf(slug), href, local, bytes: book.bytes, cover })
    if (!FLIPBOOK.test(html)) throw new Error(`no flipbook in ${slug}`)
    const next = html.replace(FLIPBOOK, markup)
    if (next !== html) {
      writeFileSync(file, next)
      changed++
    }
  }
  console.log(`Updated ${changed} of ${sources.length} flipbook pages.`)
}
