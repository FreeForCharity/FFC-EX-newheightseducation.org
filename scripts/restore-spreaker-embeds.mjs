#!/usr/bin/env node
/**
 * Puts back the Spreaker players (#62, #63) that facade-spreaker-embeds
 * replaced with click-to-load buttons in 3c9a499. Each button takes back the
 * markup it replaced, in order, from the commit before; iframes gain
 * loading="lazy", and the radio home's `a.spreaker-player` links, which need
 * Spreaker's loader script, become the iframe that script built.
 *
 * One-shot: it reads the old markup from git history, so it needs a full
 * clone, and has already run.
 *
 *   node scripts/restore-spreaker-embeds.mjs
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const BEFORE = '3c9a499^'

const BUTTON =
  /<button type="button" class="ffc-embed-facade ffc-embed-facade--audio"[^>]*>[^<]*<\/button>/g
const ORIGINAL =
  /<iframe\b[^>]*\ssrc="https:\/\/widget\.spreaker\.com\/player\?[^"]+"[^>]*>\s*<\/iframe>|<a class="spreaker-player"[^>]*>[^<]*<\/a>/g

export function spreakerLinkIframe(link) {
  const data = Object.fromEntries(
    [...link.matchAll(/\sdata-([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]])
  )
  const params = [data.resource]
  for (const [key, value] of Object.entries(data)) {
    if (['resource', 'width', 'height'].includes(key)) continue
    params.push(`${key.replace(/-/g, '_')}=${encodeURIComponent(value)}`)
  }
  const title = link.replace(/<[^>]+>/g, '').replace(/^Listen to "?|"? on Spreaker\.?$/g, '')
  return `<iframe src="https://widget.spreaker.com/player?${params.join('&amp;')}" title="${title.trim()}" width="${data.width || '100%'}" height="${(data.height || '200px').replace('px', '')}" frameborder="0" loading="lazy"></iframe>`
}

export function lazyIframe(iframe) {
  return iframe
    .replace(/#\?secret=[^"]*"/, '"')
    .replace(/\sdata-secret="[^"]*"/, '')
    .replace(/<iframe\b(?![^>]*\sloading=)/, '<iframe loading="lazy"')
}

export function restoreSpreaker(html, before) {
  const originals = [...before.matchAll(ORIGINAL)].map(([m]) =>
    m.startsWith('<a') ? spreakerLinkIframe(m) : lazyIframe(m)
  )
  let i = 0
  const next = html.replace(BUTTON, () => originals[i++])
  if (i !== originals.length) throw new Error(`expected ${originals.length} players, found ${i}`)
  return next
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    if (!BUTTON.test(html)) continue
    BUTTON.lastIndex = 0
    const path = relative(ROOT, file)
    const before = execFileSync('git', ['show', `${BEFORE}:${path}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    })
    writeFileSync(file, restoreSpreaker(html, before))
    pages++
  }
  console.log(`restored Spreaker players on ${pages} pages`)
}
