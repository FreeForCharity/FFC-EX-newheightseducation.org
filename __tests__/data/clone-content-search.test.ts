/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { CLOSE, SEARCH, TRIGGER } from '../../scripts/wire-site-search.mjs'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')

function fragments(dir = CONTENT_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return fragments(full)
    return entry.name.endsWith('.html') ? [full] : []
  })
}
const all = fragments().map((file) => ({
  page: path.relative(CONTENT_DIR, file),
  html: fs.readFileSync(file, 'utf8'),
}))
const offenders = (test: (html: string) => boolean) =>
  all.filter(({ html }) => test(html)).map(({ page }) => page)

describe('site search (#49)', () => {
  it('sends every search form to the search page', () => {
    const forms = all.flatMap(({ page, html }) =>
      [...html.matchAll(/<form\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((f) => /role="search"|searchform|search-form/.test(f))
        .map((f) => ({ page, action: f.match(/\saction="([^"]*)"/)?.[1] }))
    )
    expect(forms.length).toBeGreaterThan(1500)
    expect(forms.filter((f) => f.action !== SEARCH)).toEqual([])
  })

  it('gives every Jupiter header its search icon and the overlay a close control', () => {
    expect(offenders((h) => /<div class="main-nav-side-search">\s*<\/div>/.test(h))).toEqual([])
    expect(
      offenders((h) => h.includes('class="main-nav-side-search"') && !h.includes(TRIGGER))
    ).toEqual([])
    expect(
      offenders((h) => h.includes('class="mk-fullscreen-search-overlay"') && !h.includes(CLOSE))
    ).toEqual([])
  })

  it('points the Astra search icon at the search page', () => {
    expect(offenders((h) => /class="slide-search astra-search-icon"[^>]*href="#"/.test(h))).toEqual(
      []
    )
  })

  it('has a search page with one heading and the results container', () => {
    const html = fs.readFileSync(path.join(CONTENT_DIR, 'search.html'), 'utf8')
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain('<div id="ffc-search"></div>')
  })

  it('restores the sidebar search the capture replaced with the email block', () => {
    expect(
      offenders((h) =>
        /class="[^"]*\bwidget_search\b[^"]*"[^>]*><div class="ffc-contact-fallback"/.test(h)
      )
    ).toEqual([])
  })

  it('leaves no link that goes nowhere, apart from controls a component wires', () => {
    // Translate flags (components/translate), menu parents that open a
    // submenu, and two body controls tracked on #63.
    const allowed = (tag: string, after: string) =>
      /class="[^"]*\b(?:nturl|mk-blog-print|jcarousel-control-(?:prev|next))\b/.test(tag) ||
      /^[^<]*<\/a>\s*(?:<i class="menu-sub-level-arrow"|<span class="mk-nav-arrow|<ul\b[^>]*sub-menu)/.test(
        after
      )
    const dead = all.flatMap(({ page, html }) =>
      [...html.matchAll(/<a\b[^>]*\shref=(["'])#\1[^>]*>/g)]
        .filter(
          (m) => !allowed(m[0], html.slice(m.index + m[0].length, m.index + m[0].length + 200))
        )
        .map((m) => `${page}: ${m[0].slice(0, 80)}`)
    )
    expect(dead).toEqual([])
  })
})
