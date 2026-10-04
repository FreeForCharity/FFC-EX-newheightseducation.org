#!/usr/bin/env node
/**
 * Drops the backslashes WordPress's magic quotes left before quote entities
 * in publications posts (`Toronto\&#8217;s`), which the live site showed as
 * a visible backslash. Safe to re-run.
 *
 *   node scripts/repair-magic-quotes.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')

export const MAGIC_QUOTE = /\\+(?=&(?:#8216|#8217|#8220|#8221|#0?39|quot);)/g

// The same escapes left literal quotes inside some class attributes.
export const repairMagicQuotes = (html) =>
  html.replace(MAGIC_QUOTE, '').replace(
    /(\sclass=")([^"]*&quot;[^"]*)"/g,
    (m, open, value) =>
      `${open}${value
        .replace(/&quot;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()}"`
  )

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = repairMagicQuotes(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`Removed magic-quote backslashes on ${pages} pages.`)
}
