#!/usr/bin/env node
/**
 * Builds pages 2..N of every paginated archive (#52) from the live HTML kept
 * in the #41 release. Each page is its archive's page-1 fragment with the
 * post loop and the pagination control swapped for that page's own, localized
 * the way workflow 706 localized page 1. The converter's share, link-naming
 * and dead-control passes are imported from FFC-Cloudflare-Automation, so the
 * new loops match page 1. Page 1's control is rebuilt too: its links pointed
 * at `#` or were stripped.
 *
 * The homepage's /page/N/ URLs are skipped: they rendered the front page with
 * no control linking to them.
 *
 *   node scripts/paginate-archives.mjs --html <unzipped live-html dir> \
 *     --converter <FFC-Cloudflare-Automation>/scripts/clone-to-routes-lib.mjs
 *
 * Then run restore-lazy-images.mjs and static-store.mjs over the fragments.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repairMagicQuotes } from './repair-magic-quotes.mjs'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const APP = join(ROOT, 'src', 'app')
const ASSETS = join(ROOT, 'public', '_ffc-assets')
const SITE = 'newheightseducation.org'
const SECTIONS = { school: 'school', publications: 'publications', radio: 'radio' }

/** `school.newheightseducation.org` -> `/school`, the apex -> ``. */
const prefixOf = (host) => {
  const sub = host.replace(/^www\./, '').replace(new RegExp(`\\.?${SITE.replace('.', '\\.')}$`), '')
  return sub ? `/${SECTIONS[sub] ?? sub}` : ''
}

/** Live URL -> site route (`/school/x/`) or asset path (`host/wp-content/...`). */
export function classify(raw) {
  const url = raw.replace(/&amp;|&#0?38;/g, '&')
  const avatar = url.match(
    /^(?:https?:)?\/\/(?:secure|www|\d)\.gravatar\.com\/avatar\/([0-9a-f]+)(?:\?([^"'\s]*))?$/i
  )
  if (avatar) {
    const q = (avatar[2] ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return { asset: `secure.gravatar.com/avatar/${avatar[1]}${q ? `__${q}` : ''}.bin` }
  }
  // Jetpack's image CDN: the capture folded each query into the file name.
  const cdn = url.match(
    /^(?:https?:)?\/\/i[0-3]\.wp\.com\/((?:[a-z]+\.)?newheightseducation\.org\/[^?"'\s]+?)(\.[a-z0-9]+)(?:\?([^"'\s]*))?$/i
  )
  if (cdn) {
    const q = (cdn[3] ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return { asset: `i0.wp.com/${cdn[1]}${q ? `__${q}` : ''}${cdn[2]}` }
  }
  const m = url.match(
    /^(?:https?:)?\/\/(www\.)?((?:[a-z]+\.)?newheightseducation\.org)(\/[^"'\s]*)?$/i
  )
  if (!m) return null
  const host = m[2].toLowerCase()
  const path = m[3] ?? '/'
  if (/^\/wp-(?:content|includes)\//.test(path)) return { asset: host + path.split(/[?#]/)[0] }
  return { route: prefixOf(host) + path }
}

const routeExists = (route, extra) => {
  const clean = route.split(/[?#]/)[0].replace(/\/+$/, '')
  if (clean === '' || extra.has(`${clean}/`)) return true
  return existsSync(join(APP, clean, 'page.tsx'))
}

/** The served copy of an archived asset: exact, or its WebP twin. */
function servedAsset(path) {
  if (existsSync(join(ASSETS, path))) return path
  const webp = path.replace(/\.[a-z0-9]+$/i, '.webp')
  return existsSync(join(ASSETS, webp)) ? webp : null
}

/** Rewrites one stretch of live markup into fragment form, for a page at `route`. */
export function localize(html, route, { extraRoutes = new Set(), lib, missing = new Set() }) {
  // The converter's slugs: lowercase, percent-escapes and punctuation to hyphens.
  const local = (r) => {
    const [, path, rest] = r.match(/^([^?#]*)(.*)$/)
    const slug = lib.sanitizeSlug(path)
    return { path: slug ? `/${slug}/` : '/', rest }
  }
  const tokenFor = (url, { anchor }) => {
    const c = classify(url)
    if (!c) return undefined
    if (c.route) {
      const { path, rest } = local(c.route)
      if (!routeExists(path, extraRoutes)) return anchor ? null : undefined
      return `%%BASE%%${path}${rest}`
    }
    const served = servedAsset(c.asset)
    if (served) return `%%BASE%%/_ffc-assets/${served}`
    missing.add(c.asset)
    return anchor ? null : undefined
  }
  // A link to a page or file the export does not have keeps its text, as the
  // converter's unlinkDeadPageLinks does.
  // The converter names generic links from the original URL, so before rewriting.
  let out = lib.nameGenericLinks(repairMagicQuotes(html)).html
  out = out.replace(
    /<a\b([^>]*?)\shref="([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g,
    (tag, before, href, after, inner) => {
      const t = tokenFor(href, { anchor: true })
      if (t === undefined) return tag
      if (t === null) return inner
      return `<a${before} href="${t}"${after}>${inner}</a>`
    }
  )
  out = out.replace(
    /\s(src|href|data-src)=(["'])((?:https?:)?\/\/.+?)\2/g,
    (attr, name, q, url) => {
      const t = tokenFor(url, { anchor: false })
      return t ? ` ${name}=${q}${t}${q}` : attr
    }
  )
  out = out.replace(/\ssrcset=(["'])(.+?)\1/g, (attr, q, set) => {
    const parts = set.split(/,\s+/).map((candidate) => {
      const [url, ...rest] = candidate.trim().split(/\s+/)
      const t = tokenFor(url, { anchor: false })
      return t ? [t, ...rest].join(' ') : candidate.trim()
    })
    return ` srcset=${q}${parts.join(', ')}${q}`
  })
  // The share plugin's inputs: a file the export serves as a token, anything
  // else relative to this page, as the converter left them.
  out = out.replace(/\s(data-url|data-image)="([^"]+)"/g, (attr, name, url) => {
    const c = classify(url)
    if (!c) return attr
    if (c.asset && existsSync(join(ASSETS, c.asset))) {
      return ` ${name}="%%BASE%%/_ffc-assets/${c.asset}"`
    }
    const target = c.route
      ? c.route.split(/[?#]/)[0]
      : `${prefixOf(c.asset.split('/')[0])}/${c.asset.split('/').slice(1).join('/')}`
    const rel = posix.relative(route, target) || '.'
    return ` ${name}="${c.route ? `${rel}/`.replace(/\/\/$/, '/') : rel}"`
  })
  // Jupiter's lazy-image sets: the same form as the share inputs above.
  out = out.replace(/\sdata-mk-image-src-set='([^']*)'/g, (attr, set) => {
    const fixed = set.replace(
      /(?:https?:)?\\?\/\\?\/(?:www\.)?(?:[a-z]+\.)?newheightseducation\.org[^"]*/g,
      (url) => {
        const c = classify(url.replace(/\\\//g, '/'))
        if (!c?.asset) return url
        if (existsSync(join(ASSETS, c.asset))) return `%%BASE%%/_ffc-assets/${c.asset}`
        const target = `${prefixOf(c.asset.split('/')[0])}/${c.asset.split('/').slice(1).join('/')}`
        return posix.relative(route, target)
      }
    )
    return ` data-mk-image-src-set='${fixed}'`
  })
  out = lib.repairInlineShareButtons(out, route.replace(/^\/|\/$/g, '')).html
  out = lib.nameAnonymousLinks(out, SITE).html
  out = lib.removeDeadNamelessControls(out).html
  return out
}

/** The span from the first `<article` to the end of the last `</article>`. */
export function articleSpan(html) {
  const start = html.indexOf('<article')
  const end = html.lastIndexOf('</article>')
  if (start < 0 || end < 0) return null
  return [start, end + '</article>'.length]
}

const ARROW_LEFT =
  '<svg class="mk-svg-icon" data-name="mk-icon-angle-left" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 1792" aria-hidden="true"><path d="M627 544q0 13-10 23l-393 393 393 393q10 10 10 23t-10 23l-50 50q-10 10-23 10t-23-10l-466-466q-10-10-10-23t10-23l466-466q10-10 23-10t23 10l50 50q10 10 10 23z"/></svg>'
const ARROW_RIGHT =
  '<svg class="mk-svg-icon" data-name="mk-icon-angle-right" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 1792" aria-hidden="true"><path d="M595 960q0 13-10 23l-466 466q-10 10-23 10t-23-10l-50-50q-10-10-10-23t10-23l393-393-393-393q-10-10-10-23t10-23l50-50q10-10 23-10t23 10l466 466q10 10 10 23z"/></svg>'

export const pageHref = (archive, n) =>
  n === 1 ? `%%BASE%%/${archive}/` : `%%BASE%%/${archive}/page/${n}/`

/** Jupiter's control drew its links in JavaScript; this writes them out. */
export function jupiterControl(archive, n, max) {
  let start = Math.max(1, Math.min(n - 4, max - 8))
  const end = Math.min(max, start + 8)
  start = Math.max(1, end - 8)
  const link = (i) =>
    i === n
      ? `<a class="page-number js-pagination-page current-page" href="${pageHref(archive, i)}" aria-current="page" data-page-id="${i}">${i}</a>`
      : `<a class="page-number js-pagination-page" href="${pageHref(archive, i)}" data-page-id="${i}">${i}</a>`
  const gap = '<span class="page-number">&hellip;</span>'
  const numbers = []
  if (start > 1) numbers.push(link(1), ...(start > 2 ? [gap] : []))
  for (let i = start; i <= end; i++) numbers.push(link(i))
  if (end < max) numbers.push(...(end < max - 1 ? [gap] : []), link(max))
  const prev =
    n > 1
      ? `<a href="${pageHref(archive, n - 1)}" class="mk-pagination-previous pagination-arrows" aria-label="Previous page">${ARROW_LEFT}</a>`
      : ''
  const next =
    n < max
      ? `<a href="${pageHref(archive, n + 1)}" class="mk-pagination-next pagination-arrows" aria-label="Next page">${ARROW_RIGHT}</a>`
      : ''
  return (
    `<div class="mk-pagination mk-grid js-el jupiter-donut-clearfix" data-init-pagination="${n}" data-number-pages="8" data-max-pages="${max}" data-mk-component="Pagination">` +
    `${prev}<div class="mk-pagination-inner">${numbers.join('')}</div>${next}` +
    `<div class="mk-total-pages">page <span class="pagination-current-page js-current-page">${n}</span> of <span class="pagination-max-pages">${max}</span></div></div>`
  )
}

export const CONTROLS = {
  jupiter:
    /<div class="mk-pagination mk-grid[\s\S]*?<div class="mk-total-pages">[\s\S]*?<\/div>\s*<\/div>/,
  woo: /<nav class="woocommerce-pagination"[\s\S]*?<\/nav>/,
  astra: /<div class='ast-pagination'>[\s\S]*?<\/nav><\/div>/,
}
const RESULT_COUNT = /<p class="woocommerce-result-count"[\s\S]*?<\/p>/

export function themeOf(html) {
  if (CONTROLS.woo.test(html)) return 'woo'
  if (CONTROLS.astra.test(html)) return 'astra'
  if (CONTROLS.jupiter.test(html)) return 'jupiter'
  return null
}

/** A live WooCommerce or Astra control, with its page links made local. */
function liveControl(theme, live, archive, max) {
  const block = live.match(CONTROLS[theme])?.[0]
  if (!block) throw new Error(`no ${theme} control in live ${archive}`)
  return block
    .replace(/(<a class="prev page-numbers")/g, '$1 aria-label="Previous page"')
    .replace(/(<a class="next page-numbers")/g, '$1 aria-label="Next page"')
    .replace(/\shref="([^"]+)"/g, (attr, url) => {
      const n = Number(url.match(/\/page\/(\d+)\/?$/)?.[1] ?? 1)
      if (n > max) throw new Error(`${archive} links page ${n} past ${max}`)
      return ` href="${pageHref(archive, n)}"`
    })
}

const ENTITIES = {
  '#8211': '\u2013',
  '#8217': '\u2019',
  amp: '&',
  '#39': "'",
  '#039': "'",
  quot: '"',
}
const decode = (s) => s.replace(/&(#8211|#8217|amp|#0?39|quot);/g, (m, name) => ENTITIES[name])

const tsString = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * The live page's meta description, or one composed from the archive's name
 * and the titles it lists. Page 1's is derived text that can no longer be
 * accurate here.
 */
/** Text of an HTML snippet: tags removed until none remain. */
export function textOf(html) {
  let text = html
  let previous
  do {
    previous = text
    text = text.replace(/<[^<>]*>/g, ' ')
  } while (text !== previous)
  return text.replace(/[<>]/g, ' ')
}

const TITLE_CLASS = { jupiter: 'the-title', woo: 'product-title', astra: 'entry-title' }

export function pageDescription({ live, loop, theme, title, n, max, lib }) {
  // Yoast's empty description still renders its " - Page N" suffix.
  const meta = lib.extractMetaDescription(live)
  if (meta && meta.replace(/\s*-\s*Page \d+$/, '').trim().length >= 20) return meta
  const heading = new RegExp(
    `<h[23]\\b[^>]*class="[^"]*\\b${TITLE_CLASS[theme]}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/h[23]>`,
    'g'
  )
  const titles = [...loop.matchAll(heading)]
    .map((m) => lib.decodeEntities(textOf(m[1])).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const label = title.split(/\s[-|\u2013]\s|, Author at /)[0]
  const listed = [...new Set(titles)].join(', ')
  let text = listed ? `${label}, page ${n} of ${max}: ${listed}.` : `${label}, page ${n} of ${max}.`
  if (text.length > 155) text = `${text.slice(0, 154).replace(/[\s,]+\S*$/, '')}\u2026`
  return text
}

function pageTsx(templateTsx, { archive, n, title, description }) {
  const canonical = `/${archive}/page/${n}/`
  return templateTsx
    .replace(/description:\s*'(?:[^'\\]|\\.)*',/, `description: ${tsString(description)},`)
    .replace(/\/\/ Generated by workflow 706[^\n]*\n\/\/[^\n]*\n/, '')
    .replace(/^/, '// Generated by scripts/paginate-archives.mjs from the live archive (#41).\n')
    .replace(/title: '(?:[^'\\]|\\.)*',\n/, `title: ${tsString(title)},\n`)
    .replace(/canonical: '[^']*'/, `canonical: '${canonical}'`)
    .replace(/title: \{ absolute: '(?:[^'\\]|\\.)*' \}/, `title: { absolute: ${tsString(title)} }`)
    .replace(/className="([^"]*)"/, (m, cls) => `className="${cls} paged paged-${n}"`)
    .replace(/loadCloneContent\('([^']*)'\)/, `loadCloneContent('${archive}/page/${n}')`)
}

/** Live archives with a /page/N/ in the capture, as `{ host, base, archive }`. */
export function liveArchives(htmlDir) {
  const found = []
  for (const host of readdirSync(htmlDir)) {
    const walk = (rel) => {
      const dir = join(htmlDir, host, rel)
      if (!existsSync(dir)) return
      const entries = readdirSync(dir, { withFileTypes: true })
      if (entries.some((e) => e.isDirectory() && e.name === 'page') && rel) {
        found.push({ host, base: rel, archive: (prefixOf(host) + '/' + rel).replace(/^\//, '') })
      }
      for (const e of entries)
        if (e.isDirectory() && e.name !== 'page') walk(rel ? `${rel}/${e.name}` : e.name)
    }
    walk('')
  }
  return found.sort((a, b) => a.archive.localeCompare(b.archive))
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (name) => args[args.indexOf(`--${name}`) + 1]
  const htmlDir = arg('html')
  const lib = await import(pathToFileURL(arg('converter')).href)
  const archives = liveArchives(htmlDir)
  const plan = archives.map((a) => {
    const dir = join(htmlDir, a.host, a.base, 'page')
    const pages = readdirSync(dir)
      .map(Number)
      .filter((n) => n > 1 && existsSync(join(dir, String(n), 'index.html')))
      .sort((x, y) => x - y)
    const max = pages.length ? Math.max(...pages) : 1
    if (pages.length !== max - 1) throw new Error(`${a.archive}: gap in captured pages`)
    return { ...a, max }
  })
  const extraRoutes = new Set(
    plan.flatMap((a) => Array.from({ length: a.max - 1 }, (_, i) => `/${a.archive}/page/${i + 2}/`))
  )
  const missing = new Set()
  let written = 0
  for (const a of plan) {
    const templateFile = join(CONTENT, `${a.archive}.html`)
    const template = readFileSync(templateFile, 'utf8')
    const templateTsx = readFileSync(join(APP, a.archive, 'page.tsx'), 'utf8')
    const theme = themeOf(template)
    if (!theme) throw new Error(`${a.archive}: no pagination control`)
    const liveFile = (n) =>
      n === 1
        ? join(htmlDir, a.host, a.base, 'index.html')
        : join(htmlDir, a.host, a.base, 'page', String(n), 'index.html')
    const control = (n, live) =>
      theme === 'jupiter'
        ? jupiterControl(a.archive, n, a.max)
        : liveControl(theme, live, a.archive, a.max)

    const page1 = readFileSync(liveFile(1), 'utf8')
    let first = template.replace(CONTROLS[theme], () => control(1, page1))
    if (first !== template) writeFileSync(templateFile, first)

    for (let n = 2; n <= a.max; n++) {
      const live = readFileSync(liveFile(n), 'utf8')
      const route = `/${a.archive}/page/${n}/`
      const span = articleSpan(live)
      const tspan = articleSpan(first)
      if (!span || !tspan) throw new Error(`${a.archive} page ${n}: no articles`)
      const loop = localize(live.slice(...span), route, { extraRoutes, lib, missing })
      let html = first.slice(0, tspan[0]) + loop + first.slice(tspan[1])
      html = html.replace(CONTROLS[theme], () => control(n, live))
      const count = live.match(RESULT_COUNT)?.[0]
      if (count) html = html.replace(RESULT_COUNT, () => count)
      const title = decode(live.match(/<title>([^<]*)<\/title>/)[1].trim())
      const out = join(CONTENT, a.archive, 'page', `${n}.html`)
      mkdirSync(dirname(out), { recursive: true })
      writeFileSync(out, html)
      const tsx = join(APP, a.archive, 'page', String(n), 'page.tsx')
      mkdirSync(dirname(tsx), { recursive: true })
      const description = pageDescription({ live, loop, theme, title, n, max: a.max, lib })
      writeFileSync(tsx, pageTsx(templateTsx, { archive: a.archive, n, title, description }))
      written++
    }
  }
  console.log(`Wrote ${written} archive pages across ${plan.length} archives.`)
  if (missing.size)
    console.log(`Assets not served (${missing.size}):\n${[...missing].sort().join('\n')}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
