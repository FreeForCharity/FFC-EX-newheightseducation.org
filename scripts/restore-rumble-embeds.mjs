#!/usr/bin/env node
/**
 * Restores the Rumble videos (#62). Live filled each empty
 * `<div id="rumble_<id>">` with Rumble's script player; the export has no
 * script, so each becomes Rumble's lazy embed iframe, which /radio/ already
 * uses. Titles come from Rumble's oEmbed, saved in the live archive. Safe to
 * re-run.
 *
 *   node scripts/restore-rumble-embeds.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
export const TITLES = JSON.parse(
  readFileSync(join(ROOT, 'docs', 'live-archive', '2026-10-02', 'rumble-videos.json'), 'utf8')
)

const PLACEHOLDER =
  /<div id="rumble_(\w+)"><\/div>|<div class="ffc-rumble"><(?:iframe src="https:\/\/rumble\.com\/embed\/(\w+)\/"[^>]*><\/iframe>|button type="button" class="ffc-embed-facade ffc-embed-facade--video" data-ffc-embed="https:\/\/rumble\.com\/embed\/(\w+)\/"[^>]*>.*?<\/button>)<\/div>/g

const escape = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export function restoreRumble(html, titles = TITLES) {
  return html.replace(PLACEHOLDER, (all, div, iframe, button) => {
    const id = div || iframe || button
    const title = escape(titles[id] || 'Rumble video')
    return `<div class="ffc-rumble"><iframe src="https://rumble.com/embed/${id}/" title="${title}" loading="lazy" allow="autoplay; fullscreen" allowfullscreen></iframe></div>`
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
    const next = restoreRumble(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`restored Rumble videos on ${pages} pages`)
}
