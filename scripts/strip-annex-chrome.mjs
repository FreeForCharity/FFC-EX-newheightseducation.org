#!/usr/bin/env node
/**
 * One-off (#56): removes the Learning Annex's WordPress login, register and
 * password-reset trigger from the header, and the Color Guard and Baton Corps
 * Popup Maker dialogs, which no element on any page opens. Points the nav's
 * Enroll link, a private page that is a 404 on the live site, at the Learning
 * Annex contact page.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')

/** End offset of the element whose open tag starts at `start`. */
function elementEnd(html, start, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  re.lastIndex = start
  let depth = 0
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  throw new Error(`unclosed <${tag}> at ${start}`)
}

export const TARGETS = [/<div class="mk-header-login"/g, /<div\s+id="pum-(?:7629|7631)"/g]

export function strip(html) {
  let out = html
  for (const target of TARGETS) {
    for (let m = target.exec(out); m; m = target.exec(out)) {
      out = out.slice(0, m.index) + out.slice(elementEnd(out, m.index, 'div'))
      target.lastIndex = m.index
    }
    target.lastIndex = 0
  }
  return out.replaceAll('%%BASE%%/school/?page_id=5754', '%%BASE%%/school/contact-us/')
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = strip(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`stripped ${pages} pages`)
}
