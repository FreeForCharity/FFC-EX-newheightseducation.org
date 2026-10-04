#!/usr/bin/env node
/**
 * One-off (#54): turns the WooCommerce store into a read-only catalog. Each
 * product keeps its price and gallery, and its add-to-cart form (already the
 * "moved to email" block) becomes a link to NHEG's GiveBacks store. The
 * header cart icons, the Cart and My account menu items and the login-only
 * review form are removed, and
 * the MemberHub store links, which redirect to GiveBacks, point there
 * directly.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')
export const STORE = 'https://nheg.givebacks.com/store?category=NHEG%20Products'

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

function removeAll(html, open, tag) {
  let out = html
  for (let m = open.exec(out); m; m = open.exec(out)) {
    out = out.slice(0, m.index) + out.slice(elementEnd(out, m.index, tag))
    open.lastIndex = m.index
  }
  open.lastIndex = 0
  return out
}

const BUY =
  '<p class="ffc-store-note">Order NHEG merchandise through our online store.</p>' +
  `<p><a class="ffc-store-button" href="${STORE}" target="_blank" rel="noopener noreferrer">Buy from the NHEG store</a></p>`

export function staticStore(page, html) {
  let out = html
    .replaceAll('nheg.memberhub.com', 'nheg.givebacks.com')
    .replaceAll('nheg.memberhub.gives', 'nheg.givebacks.gives')
  out = removeAll(out, /<div class="(?:shopping-cart-header|add-cart-responsive-state)\b/g, 'div')
  // Product reviews need a WordPress login.
  out = removeAll(out, /<div id="respond"/g, 'div')
  out = removeAll(out, /<li\b[^>]*>(?=\s*<a\b[^>]*href="%%BASE%%\/(?:cart|my-account)\/")/g, 'li')
  out = out.replace(
    /aria-label="Select options for (&ldquo;[^"]*&rdquo;)"/g,
    'aria-label="View $1"'
  )
  if (page.startsWith('product/')) {
    out = out.replace(/<div class="ffc-contact-fallback"[^>]*>.*?<\/div>/s, BUY)
  }
  return out
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const page = file.slice(CONTENT.length + 1)
    const html = readFileSync(file, 'utf8')
    const next = staticStore(page, html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`updated ${pages} pages`)
}
