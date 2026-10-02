/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')
const FALLBACK = '<div class="ffc-contact-fallback"'

function fragments(dir = CONTENT_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return fragments(full)
    return entry.name.endsWith('.html') ? [full] : []
  })
}

/** The [start, end) span of the element whose open tag starts at `start`. */
function elementSpan(html: string, start: number, tag: string): [number, number] {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  re.lastIndex = start
  let depth = 0
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return [start, m.index + m[0].length]
  }
  return [start, html.length]
}

/** The site header, the search overlay and the sign-in popups. */
function chromeSpans(html: string): [number, number][] {
  const spans: [number, number][] = []
  const header = html.indexOf('<header')
  if (header !== -1) spans.push(elementSpan(html, header, 'header'))
  for (const cls of ['mk-fullscreen-search-overlay', 'mk-login-register']) {
    for (const m of html.matchAll(new RegExp(`<div class="${cls}\\b`, 'g'))) {
      spans.push(elementSpan(html, m.index!, 'div'))
    }
  }
  return spans
}

describe('captured forms (#45)', () => {
  const pages = fragments().map((file) => ({
    name: path.relative(CONTENT_DIR, file),
    html: fs.readFileSync(file, 'utf8'),
  }))

  it('finds the fragments', () => {
    expect(pages.length).toBeGreaterThan(700)
  })

  it('has no mailto block in the header, search overlay or sign-in popups', () => {
    const offenders = pages.filter(({ html }) => {
      const spans = chromeSpans(html)
      return [...html.matchAll(new RegExp(FALLBACK, 'g'))].some(({ index }) =>
        spans.some(([start, end]) => index! >= start && index! < end)
      )
    })
    expect(offenders.map((p) => p.name)).toEqual([])
  })

  it('keeps the search form wherever the theme has a search overlay', () => {
    const missing = pages.filter(
      ({ html }) =>
        html.includes('mk-fullscreen-search-wrapper') &&
        !html.includes('id="mk-fullscreen-searchform"')
    )
    expect(missing.map((p) => p.name)).toEqual([])
  })

  it('gives the restored search inputs an accessible name', () => {
    const unnamed = pages.filter(({ html }) =>
      [...html.matchAll(/<input\b[^>]*\bid="(?:s|mk-fullscreen-search-input)"[^>]*>/g)].some(
        ([tag]) => !/\baria-label="[^"]+"/.test(tag)
      )
    )
    expect(unnamed.map((p) => p.name)).toEqual([])
  })

  it('still replaces contact forms with the mailto block', () => {
    const contact = pages.find((p) => p.name === 'contact-us.html')
    expect(contact?.html).toContain(FALLBACK)
  })
})
