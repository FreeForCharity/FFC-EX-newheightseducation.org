#!/usr/bin/env node
/**
 * Built-output verification — the post-build complement to check-drift.mjs
 * (which is source-based) and rebrand-check.mjs (which is config/data-based).
 *
 * Runs against the static export in `out/` and asserts the invariants a
 * rebrand most often breaks but that source linting can't see, because they
 * only exist in the rendered HTML:
 *
 *   1. Every indexable page has exactly ONE <h1> (WCAG 1.3.1 / 2.4.6, and the
 *      heading-hierarchy bug the template's legal pages historically shipped).
 *   2. Every indexable page has a self-referential <link rel="canonical">
 *      (per-page canonical, not the homepage's — the App Router inheritance
 *      trap) at the path it is served from, and `og:url` agrees with it.
 *   3. Every indexable page has og:title, og:description, og:image and a
 *      twitter:card.
 *   4. sitemap.xml lists exactly the indexable pages, and robots.txt points
 *      at it under the base path.
 *   5. The whole export stays under SIZE_BUDGET, below the 1 GB GitHub Pages
 *      site limit.
 *
 * Run: `npm run build` first, then `node scripts/verify-build.mjs`
 * (or `npm run verify:build`). Exits non-zero on any violation.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(SCRIPT_DIR, '..')

// Error/utility pages are not indexable content, so the invariants don't apply.
const SKIP = new Set(['404.html', '_not-found.html'])
const SKIP_DIRS = new Set(['_ffc-assets', '404', '_not-found'])
export const SIZE_BUDGET = 950 * 1024 * 1024

/** Total bytes of every file under `dir`. */
export async function exportSize(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) total += await exportSize(full)
    else if (entry.isFile()) total += (await stat(full)).size
  }
  return total
}

async function walkHtml(dir, results = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Captured third-party assets and the error page's subpath copies:
      // neither is an indexable route.
      if (SKIP_DIRS.has(entry.name)) continue
      await walkHtml(full, results)
    } else if (entry.name.endsWith('.html') && !SKIP.has(entry.name)) {
      results.push(full)
    }
  }
  return results
}

const SOCIAL = ['og:title', 'og:description', 'og:image', 'twitter:card']

const metaContent = (html, key) => {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (new RegExp(`(?:property|name)="${key}"`, 'i').test(tag)) {
      return tag.match(/content="([^"]*)"/i)?.[1]
    }
  }
}

// The path of an absolute http(s) URL with no query or fragment, else undefined.
export const pathOf = (url) => {
  try {
    const { protocol, search, hash, pathname } = new URL(url)
    return /^https?:$/.test(protocol) && !search && !hash ? pathname : undefined
  } catch {
    return undefined
  }
}

const readOptional = (file) => readFile(file, 'utf8').catch(() => undefined)

/** Every violation in the static export at `out`, served under `basePath`. */
export async function verifyBuild(out, basePath = '', budget = SIZE_BUDGET) {
  const errors = []
  const size = await exportSize(out)
  if (size > budget) {
    const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
    errors.push(`out/: ${mb(size)} exceeds the ${mb(budget)} budget (Pages caps a site at 1 GB).`)
  }
  const routeOf = (page) => {
    const rel = relative(out, page).split('\\').join('/')
    return `${basePath}/${rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '/')}`
  }

  const pages = await walkHtml(out)
  for (const page of pages) {
    const rel = relative(out, page).split('\\').join('/')
    const html = await readFile(page, 'utf8')

    const h1Count = (html.match(/<h1[\s>]/g) || []).length
    if (h1Count !== 1) {
      errors.push(`${rel}: expected exactly one <h1>, found ${h1Count}.`)
    }

    const canonical = html.match(/<link[^>]+rel="canonical"[^>]*href="([^"]*)"/i)?.[1]
    if (!canonical) {
      errors.push(`${rel}: missing <link rel="canonical">.`)
    } else {
      if (pathOf(canonical) !== routeOf(page)) {
        errors.push(`${rel}: canonical ${canonical} is not the path it is served at.`)
      }
      if (metaContent(html, 'og:url') !== canonical) {
        errors.push(`${rel}: og:url does not match the canonical.`)
      }
    }

    for (const key of SOCIAL) {
      if (!metaContent(html, key)) errors.push(`${rel}: missing ${key}.`)
    }
  }

  const robots = await readOptional(join(out, 'robots.txt'))
  if (robots === undefined) {
    errors.push('robots.txt: missing.')
  } else {
    const sitemapUrl = robots.match(/^sitemap:\s*(\S+)/im)?.[1]
    if (pathOf(sitemapUrl) !== `${basePath}/sitemap.xml`) {
      errors.push(`robots.txt: Sitemap ${sitemapUrl} is not ${basePath}/sitemap.xml.`)
    }
  }

  const sitemap = await readOptional(join(out, 'sitemap.xml'))
  if (sitemap === undefined) {
    errors.push('sitemap.xml: missing.')
  } else {
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
    const listed = new Set()
    for (const loc of locs) {
      const route = pathOf(loc)
      if (route === undefined) errors.push(`sitemap.xml: ${loc} is not a plain http(s) URL.`)
      else if (listed.has(route)) errors.push(`sitemap.xml: lists ${route} more than once.`)
      listed.add(route)
    }
    const served = new Set(pages.map(routeOf))
    for (const route of served) {
      if (!listed.has(route)) errors.push(`sitemap.xml: missing ${route}.`)
    }
    for (const route of listed) {
      if (route !== undefined && !served.has(route)) {
        errors.push(`sitemap.xml: lists ${route}, which is not a page.`)
      }
    }
  }

  return { pages: pages.length, size, errors }
}

async function main() {
  const out = join(ROOT, 'out')
  try {
    await stat(out)
  } catch {
    console.error('\n❌ out/ not found. Run `npm run build` before verify:build.')
    process.exit(1)
  }

  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '')
  const { pages, size, errors } = await verifyBuild(out, basePath)
  if (pages === 0) {
    console.error('\n❌ No HTML pages found under out/. Did the build succeed?')
    process.exit(1)
  }
  if (errors.length) {
    console.error('\n❌ Built-output verification failed:')
    for (const e of errors) console.error('  - ' + e)
    console.error(
      '\nFix the page source (one <h1> per page; per-page alternates.canonical and openGraph) and rebuild.'
    )
    process.exit(1)
  }

  console.log(
    `\n✅ Built-output verified — ${pages} pages each have one <h1>, their own canonical and social tags, and are all in the sitemap; ${Math.round(size / 1024 / 1024)} MB total.`
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
