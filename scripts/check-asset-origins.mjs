#!/usr/bin/env node
/**
 * Every asset a built page loads must come from the site itself and exist in
 * `out/`. The only off-site hosts allowed are the analytics and widget hosts
 * the CSP's script-src names.
 *
 * Static rather than a browser crawl so it covers every route in seconds.
 * `<noscript>` content and inline script bodies are skipped because a browser
 * with JavaScript on never requests them; preconnect and dns-prefetch hints are
 * not asset loads. Stylesheets the pages load are checked for their `url()` targets too.
 *
 * Run: `pnpm run build` first, then `pnpm run check:assets`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const ALLOWED_HOSTS =
  /^(www\.googletagmanager\.com|connect\.facebook\.net|www\.zeffy\.com|widgets\.guidestar\.org|([a-z0-9-]+\.)+google-analytics\.com|([a-z0-9-]+\.)+clarity\.ms)$/

const ASSET_LINK_RELS = new Set([
  'stylesheet',
  'icon',
  'shortcut',
  'preload',
  'modulepreload',
  'apple-touch-icon',
  'manifest',
])

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

const decode = (value) =>
  value
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#0?38;|&amp;/g, '&')
    .trim()

// Per the HTML srcset parsing rules: a URL runs to whitespace, trailing commas
// end a candidate, and descriptors run to the next comma outside parentheses.
function srcsetUrls(value) {
  const urls = []
  let i = 0
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i++
    let url = ''
    while (i < value.length && !/\s/.test(value[i])) url += value[i++]
    if (!url) break
    if (url.endsWith(',')) {
      urls.push(url.replace(/,+$/, ''))
      continue
    }
    urls.push(url)
    let depth = 0
    while (i < value.length && !(value[i] === ',' && depth === 0)) {
      if (value[i] === '(') depth++
      else if (value[i] === ')') depth = Math.max(0, depth - 1)
      i++
    }
  }
  return urls.filter(Boolean)
}

const cssUrls = (css) =>
  [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi)].map(
    (m) => m[1] ?? m[2] ?? m[3]
  )

/**
 * Every URL a browser with JavaScript on would fetch as an asset for this page.
 * `<link rel="stylesheet">` hrefs are also pushed onto `stylesheets`, whatever
 * their extension.
 */
export function assetRefs(html, stylesheets = []) {
  let doc = html
  for (let prev; prev !== doc;) {
    prev = doc
    doc = doc
      .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
      .replace(/<noscript\b[\s\S]*?(?:<\/noscript\b[^>]*>|$)/gi, '')
  }
  doc = doc.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\b[^>]*>|$)/gi, '$1$2')
  const refs = []
  for (const [tag, name] of doc.matchAll(/<(img|source|video|audio|script|link)\b[^>]*>/gi)) {
    const kind = name.toLowerCase()
    if (kind === 'link') {
      const rels = (attr(tag, 'rel') || '').toLowerCase().split(/\s+/)
      if (!rels.some((rel) => ASSET_LINK_RELS.has(rel))) continue
      const href = attr(tag, 'href')
      if (href) refs.push(href)
      if (href && rels.includes('stylesheet')) stylesheets.push(decode(href))
      continue
    }
    for (const a of ['src', 'poster']) {
      const value = attr(tag, a)
      if (value) refs.push(value)
    }
    const srcset = attr(tag, 'srcset')
    if (srcset) refs.push(...srcsetUrls(decode(srcset)))
  }
  for (const [, , style] of doc.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    refs.push(...cssUrls(decode(style)))
  }
  for (const [, css] of doc.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi)) {
    refs.push(...cssUrls(css))
  }
  return refs.map(decode).filter((ref) => ref && !/^(data|blob|about|javascript):/i.test(ref))
}

/**
 * The problem with one reference, or undefined when it is fine. `exists` maps a
 * site path (base path already removed) to whether `out/` has that file.
 */
export function checkRef(ref, { pagePath, basePath, exists }) {
  if (/^(https?:)?\/\//i.test(ref)) {
    const url = new URL(ref, 'https://site.invalid')
    return url.port === '' && ALLOWED_HOSTS.test(url.hostname) ? undefined : `off-site ${ref}`
  }
  if (ref.startsWith('#')) return undefined
  const url = new URL(ref, `https://site.invalid${pagePath}`)
  let path = decodeURIComponent(url.pathname)
  if (basePath) {
    if (!path.startsWith(`${basePath}/`)) return `outside the base path ${ref}`
    path = path.slice(basePath.length)
  }
  if (path.endsWith('/')) path += 'index.html'
  return exists(path) ? undefined : `missing ${ref}`
}

function walkHtml(dir, results = []) {
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '_ffc-assets' || entry.name === '_next') continue
      walkHtml(full, results)
    } else if (entry.name.endsWith('.html')) {
      results.push(full)
    }
  }
  return results
}

/** URLs a stylesheet loads, ignoring data URIs and fragment-only references. */
export const stylesheetRefs = (css) =>
  cssUrls(css.replace(/\/\*[\s\S]*?\*\//g, ''))
    .map((ref) => ref.trim())
    .filter((ref) => ref && !ref.startsWith('#') && !/^(data|blob|about):/i.test(ref))

export function checkOut(outDir, basePath = '') {
  const exists = (path) => existsSync(join(outDir, path))
  const problems = new Map()
  const stylesheets = new Map()
  const report = (problem, where) => {
    if (!problems.has(problem)) problems.set(problem, [])
    problems.get(problem).push(where)
  }
  for (const file of walkHtml(outDir)) {
    const rel = relative(outDir, file).split('\\').join('/')
    const route = rel.endsWith('index.html') ? rel.slice(0, -'index.html'.length) : rel
    const pagePath = `${basePath}/${route}`
    const sheets = []
    for (const ref of assetRefs(readFileSync(file, 'utf8'), sheets)) {
      const problem = checkRef(ref, { pagePath, basePath, exists })
      if (problem) report(problem, `/${route}`)
    }
    for (const sheet of sheets) {
      if (/^(https?:)?\/\//i.test(sheet) || checkRef(sheet, { pagePath, basePath, exists }))
        continue
      const sitePath = decodeURIComponent(
        new URL(sheet, `https://site.invalid${pagePath}`).pathname
      )
      if (!stylesheets.has(sitePath)) stylesheets.set(sitePath, `/${route}`)
    }
  }
  for (const [sitePath] of stylesheets) {
    const file = join(outDir, basePath ? sitePath.slice(basePath.length) : sitePath)
    for (const ref of stylesheetRefs(readFileSync(file, 'utf8'))) {
      const problem = checkRef(ref, { pagePath: sitePath, basePath, exists })
      if (problem) report(problem, sitePath)
    }
  }
  return problems
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-asset-origins.mjs')
if (invokedDirectly) {
  const outDir = join(process.cwd(), 'out')
  if (!existsSync(outDir)) {
    console.error('❌ out/ not found. Run `pnpm run build` before check:assets.')
    process.exit(1)
  }
  const problems = checkOut(outDir, (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, ''))
  if (problems.size === 0) {
    console.log('✅ Every asset on every page is served from the site.')
    process.exit(0)
  }
  for (const [problem, pages] of problems) {
    const unique = [...new Set(pages)]
    console.error(
      `❌ ${problem}\n   on ${unique.length} page(s), e.g. ${unique.slice(0, 3).join(', ')}`
    )
  }
  console.error(`\n${problems.size} asset problem(s).`)
  process.exit(1)
}
