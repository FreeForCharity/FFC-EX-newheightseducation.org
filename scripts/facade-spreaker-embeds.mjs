#!/usr/bin/env node
/**
 * Loads the Spreaker episode players on request (#57, #63). The radio pages
 * and posts embed 967 of them, up to 13 on one page, and each loads its own
 * player at once; a host page reached 7.6 MB. Each iframe becomes a button
 * that components/embed-facade swaps for the player. Safe to re-run.
 *
 *   node scripts/facade-spreaker-embeds.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')

const SPREAKER_IFRAME =
  /<iframe\b([^>]*\ssrc="(https:\/\/widget\.spreaker\.com\/player\?[^"]+)"[^>]*)>\s*<\/iframe>/g

export function facadeSpreakerEmbeds(html) {
  return html.replace(SPREAKER_IFRAME, (all, attrs, src) => {
    const title = attrs.match(/\stitle="([^"]*)"/)?.[1]?.trim() || 'Spreaker episode'
    const url = src.replace(/&#0?38;|&amp;/g, '&').replace(/#\?secret=.*$/, '')
    return `<button type="button" class="ffc-embed-facade ffc-embed-facade--audio" data-ffc-embed="${url.replace(/&/g, '&amp;')}" data-ffc-embed-title="${title}">Play: ${title}</button>`
  })
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = facadeSpreakerEmbeds(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`Deferred Spreaker players on ${pages} pages.`)
}
