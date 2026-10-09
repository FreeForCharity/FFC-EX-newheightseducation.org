#!/usr/bin/env node
/**
 * One-off (#59): the conversion unwrapped links to files it had not captured
 * (PDFs, Word documents, spreadsheets, zips, images), leaving only their text. Re-links each one
 * from the live archive, matching by position among same-text occurrences,
 * to the copy in public/_ffc-assets or a release asset.
 *
 *   node scripts/restore-file-links.mjs --archive <unzipped html dir>
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOSTS, contentNameFor, mapUrl } from './map-live-urls.mjs'

const ROOT = join(import.meta.dirname, '..')
const ARCHIVE_DOCS = join(ROOT, 'docs', 'live-archive', '2026-10-02')
const FILE_LINK =
  /<a\s([^>]*?)href="(https?:\/\/[^"]+\.(?:pdf|docx?|zip|pptx?|xlsx?|xlsm|jpe?g|png))"([^>]*)>([^<]+)<\/a>/gi

/** Live file url -> where it is served from now, or null. */
export function fileTarget(url, released, exists = (p) => existsSync(join(ROOT, 'public', p))) {
  const { host, pathname } = new URL(url)
  const local = `_ffc-assets/${host.replace(/^www\./, '')}${decodeURIComponent(pathname)}`
  if (exists(local)) return `%%BASE%%/${local}`
  const webp = local.replace(/\.(?:jpe?g|png)$/i, '.webp')
  if (webp !== local && exists(webp)) return `%%BASE%%/${webp}`
  return released.get(pathname.split('/').pop().toLowerCase()) ?? null
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Each `>text<` in the markup, and whether an `<a>` already wraps it. */
export function occurrences(html, text) {
  const re = new RegExp(`>(\\s*)${escapeRe(text)}(\\s*)<`, 'g')
  return [...html.matchAll(re)].map((m) => {
    const open = html.lastIndexOf('<', m.index)
    return { index: m.index, linked: /^<a[\s>]/i.test(html.slice(open, m.index + 1)) }
  })
}

/** Where `text` sits run together with other text, if exactly once and outside tags. */
export function textRunIndex(html, text) {
  const hits = []
  for (let i = html.indexOf(text); i >= 0; i = html.indexOf(text, i + 1)) {
    if (html.lastIndexOf('<', i) < html.lastIndexOf('>', i)) hits.push(i)
  }
  return hits.length === 1 ? hits[0] : -1
}

/** Wraps the bare occurrence at `index` in `<a ...attrs>`. */
export function wrapAt(html, index, text, attrs) {
  const start = html.indexOf(text, index)
  return `${html.slice(0, start)}<a ${attrs}>${text}</a>${html.slice(start + text.length)}`
}

/** Re-links one page; returns the new markup plus what it did and could not do. */
export function restorePage(live, html, released, exists) {
  const fixed = []
  const skipped = []
  const edits = []
  for (const m of live.matchAll(FILE_LINK)) {
    const [, pre, href, post, text] = m
    if (!text.replace(/&nbsp;|\s/g, '')) continue
    const there = occurrences(html, text)
    const here = occurrences(live, text)
    const k = here.findIndex((o) => o.index > m.index)
    const run = here.length === 1 && there.length === 0 ? textRunIndex(html, text) : -1
    if (run >= 0) {
      const target = fileTarget(href, released, exists)
      if (target) {
        edits.push({
          index: run,
          text,
          attrs: `${pre}href="${target}"${post}`.replace(/\s+/g, ' ').trim(),
        })
        fixed.push(text)
        continue
      }
    }
    if (there.length !== here.length) {
      if (!html.includes(href.split('/').pop()))
        skipped.push(`${text} (${href}): page text differs`)
      continue
    }
    if (there[k].linked) continue
    const target = fileTarget(href, released, exists)
    if (!target) {
      skipped.push(`${text} (${href}): no copy`)
      continue
    }
    const attrs = `${pre}href="${target}"${post}`.replace(/\s+/g, ' ').trim()
    edits.push({ index: there[k].index, text, attrs })
    fixed.push(text)
  }
  for (const e of edits.sort((a, b) => b.index - a.index))
    html = wrapAt(html, e.index, e.text, e.attrs)
  return { html, fixed, skipped }
}

if (process.argv[1] === import.meta.filename) {
  const archive = process.argv[process.argv.indexOf('--archive') + 1]
  const released = new Map()
  for (const f of ['publications-pdfs.json', 'newsletters.json'])
    for (const e of JSON.parse(readFileSync(join(ARCHIVE_DOCS, f), 'utf8')))
      released.set(e.asset.toLowerCase(), e.url)

  let total = 0
  for (const host of Object.keys(HOSTS)) {
    for (const p of JSON.parse(readFileSync(join(archive, `${host}.json`), 'utf8'))) {
      const file = join(archive, host, new URL(p.url).pathname, 'index.html')
      const name = p.status === 200 && existsSync(file) && contentNameFor(mapUrl(p.url).path)
      if (!name) continue
      const path = join(ROOT, 'src', 'clone-content', `${name}.html`)
      const { html, fixed, skipped } = restorePage(
        readFileSync(file, 'utf8'),
        readFileSync(path, 'utf8'),
        released
      )
      if (fixed.length) writeFileSync(path, html)
      total += fixed.length
      for (const t of fixed) console.log(`linked   ${name}: ${t}`)
      for (const t of skipped) console.log(`skipped  ${name}: ${t}`)
    }
  }
  console.log(`relinked ${total}`)
}
