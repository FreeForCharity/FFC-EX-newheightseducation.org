#!/usr/bin/env node
/**
 * One-off (#26): the live site's Broken Link Checker struck through 221 links
 * (`class="broken_link"` plus a line-through style), and the export copied
 * them. Each link was checked in a browser on 2026-10-20; the results are in
 * docs/cutover/struck-links.csv. A moved link gets its new address, a dead one
 * points at its site's home page (the NHEG owner's call, 2026-10-21) or, when
 * the whole site is gone, keeps only its text. The strikethrough goes everywhere.
 *
 *   node scripts/repair-struck-links.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const TABLE = join(ROOT, 'docs', 'cutover', 'struck-links.csv')

export const STRIKE_STYLE =
  '<style type="text/css">.ffc-clone .broken_link, .ffc-clone a.broken_link {\n\ttext-decoration: line-through;\n}</style>'

const RESULTS = new Set(['moved', 'works', 'dead', 'unverified'])

const unescape = (s) => s.replace(/&amp;/g, '&')
const escape = (s) => s.replace(/&/g, '&amp;')

/** `url,result,new_url,note,home_url` rows, keyed by url. */
export function parseTable(csv) {
  const table = new Map()
  for (const line of csv.trim().split('\n').slice(1)) {
    const cells = [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)]
      .map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'))
      .slice(0, 5)
    const [url, result, newUrl, , homeUrl] = cells
    if (!RESULTS.has(result)) throw new Error(`bad result "${result}" for ${url}`)
    if (result === 'moved' && !newUrl) throw new Error(`moved without a new url: ${url}`)
    if (homeUrl && result !== 'dead') throw new Error(`home url on a ${result} link: ${url}`)
    table.set(url, { result, newUrl: result === 'dead' ? homeUrl : newUrl })
  }
  return table
}

/** Repairs one page; throws on a struck link the table does not cover. */
export function repairStruckLinks(html, table) {
  const counts = { moved: 0, works: 0, dead: 0, unverified: 0 }
  const out = html
    .replace(STRIKE_STYLE, '')
    .replace(
      /<a\b([^>]*?) class="broken_link"([^>]*)>([\s\S]*?)<\/a>/g,
      (all, before, after, inner) => {
        const attrs = before + after
        const href = unescape(/\bhref="([^"]*)"/.exec(attrs)?.[1] ?? '').trim()
        const row = table.get(href)
        if (!row) throw new Error(`no result for struck link ${href}`)
        counts[row.result]++
        if (row.result === 'dead' && !row.newUrl) return inner
        if (row.result !== 'moved' && row.result !== 'dead') return `<a${attrs}>${inner}</a>`
        const text =
          inner.trim() === href || inner.trim() === escape(href) ? escape(row.newUrl) : inner
        return `<a${attrs.replace(/\bhref="[^"]*"/, `href="${escape(row.newUrl)}"`)}>${text}</a>`
      }
    )
  return { html: out, counts }
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  const table = parseTable(readFileSync(TABLE, 'utf8'))
  const total = { moved: 0, works: 0, dead: 0, unverified: 0 }
  let changed = 0
  for (const file of walk(CONTENT)) {
    const text = readFileSync(file, 'utf8')
    const { html, counts } = repairStruckLinks(text, table)
    for (const k of Object.keys(total)) total[k] += counts[k]
    if (html !== text) {
      writeFileSync(file, html)
      changed++
    }
  }
  console.log(`Repaired ${changed} pages:`, total)
}
