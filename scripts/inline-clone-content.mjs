#!/usr/bin/env node
/**
 * Postbuild: replaces each `<!--ffc-clone:...-->` marker that
 * `src/lib/clone-content.ts` renders in production with its fragment, applying
 * the same `%%BASE%%` and `%%SITEURL_ENC%%` substitutions. Run by `pnpm run
 * build` after `next build`.
 */
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT_DIR = join(ROOT, 'src', 'clone-content')
const MARKER = /<!--ffc-clone:([^\s-]+) ([^\s-]*) ([^\s-]*)-->/g

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

export function inline(html, read) {
  return html.replace(MARKER, (_, ...args) => {
    const [name, basePath, siteUrlEncoded] = args.slice(0, 3).map(decodeURIComponent)
    if (!/^[a-z0-9][a-z0-9\-_/]*$/.test(name) || name.includes('..')) {
      throw new Error(`unexpected clone content name: ${name}`)
    }
    return read(name).split('%%BASE%%').join(basePath).split('%%SITEURL_ENC%%').join(siteUrlEncoded)
  })
}

export function inlineOut(out, contentDir = CONTENT_DIR) {
  const read = (name) => readFileSync(join(contentDir, `${name}.html`), 'utf8')
  let pages = 0
  for (const file of walk(out)) {
    const html = readFileSync(file, 'utf8')
    const next = inline(html, read)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  return pages
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  console.log(`Inlined clone content into ${inlineOut(join(ROOT, 'out'))} pages.`)
}
