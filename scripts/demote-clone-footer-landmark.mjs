#!/usr/bin/env node
/**
 * Drops `role="contentinfo"` from the captured WordPress footer
 * (`<section id="mk-footer">`) in every clone fragment. The site's own
 * <footer> is already the page's contentinfo landmark, so each page carried
 * two. A page should have only one top-level contentinfo landmark. The
 * post-deploy smoke reads the first `footer, [role="contentinfo"]` it finds,
 * which was this section. It has no policy links, so the footer compliance
 * check failed (#177). The section's markup and look are unchanged.
 * Safe to re-run.
 *
 *   node scripts/demote-clone-footer-landmark.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')

export const FOOTER_LANDMARK = /(<section id="mk-footer"[^>]*?) role="contentinfo"/g

export const demoteFooterLandmark = (html) => html.replace(FOOTER_LANDMARK, '$1')

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = demoteFooterLandmark(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`Removed the duplicate contentinfo landmark from ${pages} pages.`)
}
