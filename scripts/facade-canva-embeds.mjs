#!/usr/bin/env node
/**
 * Loads the Canva presentations on request (#57). Each embed pulls about
 * 23 MB of Canva's fonts as the page loads, and it sits close enough to the
 * fold that `loading="lazy"` does not defer it. The iframe becomes a button
 * that components/embed-facade swaps for it; Canva's own link below it still
 * works without JavaScript. Safe to re-run.
 *
 *   node scripts/facade-canva-embeds.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')

const CANVA_IFRAME =
  /<iframe\b[^>]*\ssrc="(https:\/\/www\.canva\.com\/design\/[^"]+\/watch\?embed)"[^>]*>\s*<\/iframe>(\s*<\/div>\s*<a\b[^>]*>([^<]*)<\/a>)/g

export function facadeCanvaEmbeds(html) {
  return html.replace(CANVA_IFRAME, (all, src, after, name) => {
    const title = name.trim() || 'Canva presentation'
    return `<button type="button" class="ffc-embed-facade" data-ffc-embed="${src}" data-ffc-embed-title="${title}">Play &ldquo;${title}&rdquo; (Canva)</button>${after}`
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
    const next = facadeCanvaEmbeds(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`Deferred Canva embeds on ${pages} pages.`)
}
