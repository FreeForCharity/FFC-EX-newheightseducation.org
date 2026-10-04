/**
 * @jest-environment node
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inline, inlineOut } from '../../scripts/inline-clone-content.mjs'

const marker = (...args: string[]) =>
  `<!--ffc-clone:${args.map((v) => encodeURIComponent(v).replace(/-/g, '%2D')).join(' ')}-->`

describe('inline', () => {
  const read = (name: string) =>
    ({ index: '<a href="%%BASE%%/x/">x</a><a href="?u=%%SITEURL_ENC%%">s</a>' })[name] ?? ''

  it('substitutes the base path and site URL carried by the marker', () => {
    expect(inline(`<div>${marker('index', '/my-base', 'https%3A%2F%2Fa-b.org')}</div>`, read)).toBe(
      '<div><a href="/my-base/x/">x</a><a href="?u=https%3A%2F%2Fa-b.org">s</a></div>'
    )
  })

  it('leaves the markup after the marker alone', () => {
    const html = `<div>${marker('index', '', 'u')}</div><!--$--><!--/$--></main>`
    expect(inline(html, read)).toBe(
      '<div><a href="/x/">x</a><a href="?u=u">s</a></div><!--$--><!--/$--></main>'
    )
  })

  it('refuses a name outside the content directory', () => {
    expect(() => inline(marker('../secret', '', ''), read)).toThrow(/unexpected/)
  })
})

describe('inlineOut', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'inline-clone-'))
    mkdirSync(join(dir, 'content', 'school'), { recursive: true })
    mkdirSync(join(dir, 'out', 'school', 'about'), { recursive: true })
    writeFileSync(join(dir, 'content', 'school', 'about.html'), '<p>About</p>')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('fills every page that carries a marker', () => {
    const page = join(dir, 'out', 'school', 'about', 'index.html')
    writeFileSync(page, `<main><div>${marker('school/about', '', '')}</div></main>`)
    writeFileSync(join(dir, 'out', 'plain.html'), '<p>no marker</p>')
    expect(inlineOut(join(dir, 'out'), join(dir, 'content'))).toBe(1)
    expect(readFileSync(page, 'utf8')).toBe('<main><div><p>About</p></div></main>')
  })
})
