#!/usr/bin/env node
/**
 * Every asset a built page loads must come from the site itself and exist in
 * `out/`. The only off-site hosts allowed are the analytics and widget hosts
 * the CSP's script-src names.
 *
 * Static rather than a browser crawl so it covers every route in seconds.
 * `<noscript>` content and inline script bodies are skipped because a browser
 * with JavaScript on never requests them; preconnect and dns-prefetch hints are
 * not asset loads. URLs inside captured `.css` files are not checked yet (#50).
 *
 * Run: `pnpm run build` first, then `pnpm run check:assets`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const ALLOWED_HOSTS =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|clarity\.ms|facebook\.net|zeffy\.com)$|^widgets\.guidestar\.org$/

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

const srcsetUrls = (value) =>
  value
    .split(/,\s+/)
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)

const cssUrls = (css) =>
  [...css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi)].map(
    (m) => m[1] ?? m[2] ?? m[3]
  )

/** Every URL a browser with JavaScript on would fetch as an asset for this page. */
export function assetRefs(html) {
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
    const host = new URL(ref, 'https://site.invalid').hostname
    return ALLOWED_HOSTS.test(host) ? undefined : `off-site ${ref}`
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

export function checkOut(outDir, basePath = '') {
  const exists = (path) => existsSync(join(outDir, path))
  const problems = new Map()
  for (const file of walkHtml(outDir)) {
    const rel = relative(outDir, file).split('\\').join('/')
    const route = rel.endsWith('index.html') ? rel.slice(0, -'index.html'.length) : rel
    const pagePath = `${basePath}/${route}`
    for (const ref of assetRefs(readFileSync(file, 'utf8'))) {
      const problem = checkRef(ref, { pagePath, basePath, exists })
      if (!problem) continue
      if (!problems.has(problem)) problems.set(problem, [])
      problems.get(problem).push(`/${route}`)
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
