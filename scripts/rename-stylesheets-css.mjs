#!/usr/bin/env node
/**
 * One-off (#44): GitHub Pages serves `.php` as application/x-httpd-php and
 * `.bin` as application/octet-stream, and browsers refuse both as
 * stylesheets. Renames every linked stylesheet that does not end in `.css`
 * to `.css` in the same directory, so its relative url()s still resolve, and
 * rewrites the links.
 */
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const LINK = /<link\b[^>]*>/gi
const HREF = /\bhref=(['"])%%BASE%%\/(_ffc-assets\/[^'"]+\.(?:php|bin))\1/i

export const cssPath = (path) => path.replace(/\.(php|bin)$/i, '.css')

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

export function rewrite(html, renamed = new Set()) {
  return html.replace(LINK, (tag) => {
    if (!/\brel=(['"])stylesheet\1/i.test(tag)) return tag
    const m = tag.match(HREF)
    if (!m) return tag
    renamed.add(m[2])
    return tag.replace(m[2], cssPath(m[2]))
  })
}

if (process.argv[1] === import.meta.filename) {
  const renamed = new Set()
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = rewrite(html, renamed)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  for (const path of renamed) {
    const from = join(ROOT, 'public', path)
    const to = join(ROOT, 'public', cssPath(path))
    if (existsSync(to)) throw new Error(`${cssPath(path)} already exists`)
    renameSync(from, to)
  }
  console.log(`renamed ${renamed.size} stylesheets, rewrote ${pages} pages`)
}
