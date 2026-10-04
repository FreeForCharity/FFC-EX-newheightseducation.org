#!/usr/bin/env node
/**
 * Replaces meta descriptions the converter derived from page chrome. Where a
 * page had no description of its own, workflow 706 quoted its first words,
 * which on 267 pages were the header's cart count, a login link or the "This
 * form has moved to email" block. Each now uses the live page's own meta
 * description from the #41 capture, or text from its main content.
 *
 *   node scripts/repair-descriptions.mjs --html <unzipped live-html dir> \
 *     --converter <FFC-Cloudflare-Automation>/scripts/clone-to-routes-lib.mjs
 *
 * Then run prettier over src/app.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
const APP = join(ROOT, 'src', 'app')
const CONTENT = join(ROOT, 'src', 'clone-content')
const SECTIONS = { school: 'school', publications: 'publications', radio: 'radio' }

/** Whether a description was quoted from the page's chrome. */
export const isChrome = (d) =>
  d.includes('This form has moved to email') || /^(?:0 Cart|Login|NHEG PUBLICATIONS)\b/.test(d)

const DESCRIPTION = /description:\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/
const TITLE = /absolute:\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/

/** The live capture's file for a route. */
export function liveFile(htmlDir, route) {
  const [first, ...rest] = route.split('/').filter(Boolean)
  const host = SECTIONS[first]
    ? `${SECTIONS[first]}.newheightseducation.org`
    : 'newheightseducation.org'
  const path = SECTIONS[first] ? rest : [first, ...rest].filter(Boolean)
  return join(htmlDir, host, ...path, 'index.html')
}

/** The page's own content, without header, footer, sidebar or fallback blocks. */
export function mainContent(html) {
  const start = [/<div id="theme-page"/, /<div id="content"/, /<main\b/]
    .map((re) => html.search(re))
    .find((i) => i >= 0)
  const end = [/<section id="mk-footer"/, /<div class="site-footer"/, /<footer\b/]
    .map((re) => html.search(re))
    .find((i) => i > (start ?? 0))
  // Removed until none remain, so no nested remnant survives.
  let content = html.slice(start ?? 0, end ?? html.length)
  let previous
  do {
    previous = content
    content = content.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
  } while (content !== previous)
  return content
    .replace(/<div class="ffc-contact-fallback"[^>]*>(?:(?!<\/div>)[^])*<\/div>/g, '')
    .replace(/<span class="ffc-sr-only">[^<]*<\/span>/g, '')
    .replace(/<div id="mk-breadcrumbs"[\s\S]*?<\/div>\s*<\/div>/g, '')
    .replace(/<(aside|nav)\b[\s\S]*?<\/\1>/g, '')
}

/** Text of an HTML snippet: tags removed until none remain. */
export function textOf(html) {
  // WordPress's magic quotes left a backslash before some entities.
  let text = html.replace(/\\+(?=&(?:#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '')
  let previous
  do {
    previous = text
    text = text.replace(/<[^<>]*>/g, ' ')
  } while (text !== previous)
  return text.replace(/[<>]/g, ' ')
}

const clip = (text) =>
  text.length > 155 ? `${text.slice(0, 154).replace(/[\s,]+\S*$/, '')}\u2026` : text

/** An archive's name and the titles it lists. */
export function archiveDescription(fragment, title, lib) {
  const titles = [
    ...mainContent(fragment).matchAll(
      /<h[23]\b[^>]*class="[^"]*\b(?:the-title|product-title|entry-title)\b[^"]*"[^>]*>([\s\S]*?)<\/h[23]>/g
    ),
  ]
    .map((m) =>
      lib
        .decodeEntities(textOf(m[1]))
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.!?\s]+$/, '')
    )
    .filter(Boolean)
  if (!titles.length) return null
  const label = title.split(/\s[-|\u2013]\s|, Author at /)[0]
  return clip(`${label}: ${[...new Set(titles)].join(', ')}.`)
}

/** The first paragraph of the page's own text long enough to describe it. */
export function firstParagraph(fragment, lib) {
  for (const m of mainContent(fragment).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
    const text = lib.decodeEntities(textOf(m[1])).replace(/\s+/g, ' ').trim()
    if (text.length >= 60 && !isChrome(text)) return clip(text)
  }
  return null
}

const tsString = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name === 'page.tsx' ? [join(dir, e.name)] : []
  )

async function main() {
  const args = process.argv.slice(2)
  const arg = (name) => {
    const i = args.indexOf(`--${name}`)
    const value = i >= 0 ? args[i + 1] : undefined
    if (!value || value.startsWith('--') || !existsSync(value)) {
      console.error(`--${name} must name an existing path`)
      process.exit(2)
    }
    return value
  }
  const htmlDir = arg('html')
  const lib = await import(pathToFileURL(arg('converter')).href)
  const counts = { live: 0, content: 0, title: 0 }
  for (const file of walk(APP)) {
    const tsx = readFileSync(file, 'utf8')
    const current = tsx.match(DESCRIPTION)?.[2]
    if (!current || !isChrome(current.replace(/\\(.)/g, '$1'))) continue
    const route = `/${relative(APP, file).replace(/\/?page\.tsx$/, '')}/`.replace(/\/+/g, '/')
    const live = liveFile(htmlDir, route)
    let description = existsSync(live)
      ? lib.extractMetaDescription(readFileSync(live, 'utf8'))
      : null
    if (description) counts.live++
    const title = tsx.match(TITLE)[2].replace(/\\(.)/g, '$1')
    if (!description) {
      const name = tsx.match(/loadCloneContent\(\s*'([^']+)'/)?.[1]
      const fragment = name ? readFileSync(join(CONTENT, `${name}.html`), 'utf8') : ''
      const classes = (tsx.match(/className="([^"]*)"/)?.[1] ?? '').split(/\s+/)
      const archive = ['archive', 'blog', 'woocommerce-shop'].some((c) => classes.includes(c))
      const issue = title.replace(/ - NHEG$/, '')
      description = fragment.includes('class="ffc-flipbook')
        ? `${issue}, an issue from NHEG Publications, with its cover and a link to the PDF.`
        : archive
          ? archiveDescription(fragment, title, lib)
          : firstParagraph(fragment, lib)
      if (description) counts.content++
    }
    if (!description || isChrome(description)) {
      description = title
      counts.title++
    }
    writeFileSync(file, tsx.replace(DESCRIPTION, `description: ${tsString(description)}`))
  }
  console.log(
    `Descriptions: ${counts.live} from the live page, ${counts.content} from page content, ${counts.title} from the title.`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
