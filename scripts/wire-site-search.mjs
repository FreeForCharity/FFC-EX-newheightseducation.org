#!/usr/bin/env node
/**
 * Points every search control at the static search page (#49). The forms
 * submitted `?s=` to WordPress, which the export answers with the homepage.
 * Restores the header's search icon and the overlay's close control, which
 * the capture dropped as dead links, and puts back the publications sidebar
 * search the capture replaced with the "moved to email" block. Safe to re-run.
 *
 *   node scripts/wire-site-search.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')
export const SEARCH = '%%BASE%%/search/'

const SEARCH_ICON =
  '<svg class="mk-svg-icon" data-name="mk-icon-search" style=" height:16px; width: 14.857142857143px; " xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1664 1792" aria-hidden="true"><path d="M1152 832q0-185-131.5-316.5t-316.5-131.5-316.5 131.5-131.5 316.5 131.5 316.5 316.5 131.5 316.5-131.5 131.5-316.5zm512 832q0 52-38 90t-90 38q-54 0-90-38l-343-342q-179 124-399 124-143 0-273.5-55.5t-225-150-150-225-55.5-273.5 55.5-273.5 150-225 225-150 273.5-55.5 273.5 55.5 225 150 150 225 55.5 273.5q0 220-124 399l343 343q37 37 37 90z"/></svg>'
const CLOSE_ICON =
  '<svg class="mk-svg-icon" data-name="mk-moon-close-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M390.628 345.372l-45.256 45.256-89.372-89.373-89.373 89.372-45.255-45.255 89.373-89.372-89.372-89.373 45.254-45.254 89.373 89.372 89.372-89.373 45.256 45.255-89.373 89.373 89.373 89.372z"/></svg>'

export const TRIGGER = `<a class="mk-search-trigger add-header-height mk-fullscreen-trigger" href="${SEARCH}" aria-label="Search"><i class="mk-svg-icon-wrapper">${SEARCH_ICON}</i></a>`
export const CLOSE = `<button type="button" class="mk-fullscreen-close" aria-label="Close search">${CLOSE_ICON}</button>`
const SIDEBAR_SEARCH = `<form role="search" method="get" action="${SEARCH}" class="wp-block-search__button-outside wp-block-search__text-button wp-block-search" ><label class="wp-block-search__label" for="wp-block-search__input-1" >Search</label><div class="wp-block-search__inside-wrapper" ><input class="wp-block-search__input" id="wp-block-search__input-1" placeholder="" value="" type="search" name="s" required /><button aria-label="Search" class="wp-block-search__button wp-element-button" type="submit" >Search</button></div></form>`

export function wireSearch(html) {
  return html
    .replace(
      /(<form\b(?=[^>]*(?:id="mk-fullscreen-searchform"|class="responsive-searchform"|class="search-form"))[^>]*\saction=")[^"]*(")/g,
      `$1${SEARCH}$2`
    )
    .replace(/(<a class="slide-search astra-search-icon"[^>]*\shref=")#(")/g, `$1${SEARCH}$2`)
    .replace(/(<div class="main-nav-side-search">)\s*(<\/div>)/g, `$1 ${TRIGGER} $2`)
    .replace(/(<div class="mk-fullscreen-search-overlay">)(?!\s*<button)/g, `$1 ${CLOSE}`)
    .replace(
      /(<aside\b[^>]*class="[^"]*\bwidget_search\b[^"]*"[^>]*>)<div class="ffc-contact-fallback"[^>]*>(?:(?!<\/div>)[^])*<\/div>/g,
      `$1${SIDEBAR_SEARCH}`
    )
}

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

const SEARCH_BODY =
  '<div class="ffc-search-page"><h1 class="ffc-search-heading">Search</h1><div id="ffc-search"></div>' +
  '<noscript><p>Search needs JavaScript. Every page is listed in the <a href="%%BASE%%/sitemap.xml">site map</a>.</p></noscript></div>'

/** The search page: the contact page's chrome with its content swapped out. */
export function searchPage(contact) {
  const open = contact.match(/<div class="theme-content[^"]*" itemprop="mainEntityOfPage">/)
  if (!open) throw new Error('no content area in the contact page')
  const start = open.index
  const end = elementEnd(contact, start, 'div')
  return (contact.slice(0, start) + open[0] + SEARCH_BODY + '</div>' + contact.slice(end)).replace(
    /^<h1 class="ffc-sr-only">[^<]*<\/h1>\s*/,
    ''
  )
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = wireSearch(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  const contact = readFileSync(join(CONTENT, 'contact-us.html'), 'utf8')
  writeFileSync(join(CONTENT, 'search.html'), searchPage(contact))
  console.log(`Wired search on ${pages} pages and wrote search.html.`)
}
