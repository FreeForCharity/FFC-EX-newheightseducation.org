import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathOf, verifyBuild } from '../../scripts/verify-build.mjs'

const ORIGIN = 'https://example.org'

const page = (url: string, { h1 = 1, og = url, social = true } = {}) =>
  [
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:url" content="${og}">`,
    social
      ? '<meta property="og:title" content="t"><meta property="og:description" content="d">' +
        '<meta property="og:image" content="i.png"><meta name="twitter:card" content="summary">'
      : '',
    '<h1>x</h1>'.repeat(h1),
  ].join('')

const sitemap = (...urls: string[]) =>
  `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`

describe('pathOf', () => {
  it('returns the path of a plain http(s) URL only', () => {
    expect(pathOf('https://a.org/x/')).toBe('/x/')
    expect(pathOf('http://a.org/x/')).toBe('/x/')
    for (const url of [
      'https://a.org/x/?p=1',
      'https://a.org/x/#t',
      'file:///x/',
      'x/',
      undefined,
    ]) {
      expect(pathOf(url)).toBeUndefined()
    }
  })
})

describe('verifyBuild', () => {
  let out = ''
  const write = (path: string, body: string) => {
    mkdirSync(join(out, path, '..'), { recursive: true })
    writeFileSync(join(out, path), body)
  }
  const site = (base = '') => {
    write('index.html', page(`${ORIGIN}${base}/`))
    write('about/index.html', page(`${ORIGIN}${base}/about/`))
    write('robots.txt', `User-Agent: *\nSitemap: ${ORIGIN}${base}/sitemap.xml\n`)
    write('sitemap.xml', sitemap(`${ORIGIN}${base}/`, `${ORIGIN}${base}/about/`))
  }

  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'verify-build-'))
  })
  afterEach(() => rmSync(out, { recursive: true, force: true }))

  it('passes a root build and a subpath build', async () => {
    site()
    expect(await verifyBuild(out)).toEqual({ pages: 2, errors: [] })
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out)
    site('/base')
    expect(await verifyBuild(out, '/base')).toEqual({ pages: 2, errors: [] })
  })

  it('skips error pages and captured assets', async () => {
    site()
    write('404.html', '')
    write('404/index.html', '')
    write('_not-found/index.html', '')
    write('_ffc-assets/embed/index.html', '')
    expect((await verifyBuild(out)).errors).toEqual([])
  })

  it('flags headings, canonicals, og:url and social tags', async () => {
    site()
    write(
      'about/index.html',
      page(`${ORIGIN}/elsewhere/?p=1`, { h1: 2, og: `${ORIGIN}/`, social: false })
    )
    write('contact/index.html', '<h1>x</h1>')
    write('sitemap.xml', sitemap(`${ORIGIN}/`, `${ORIGIN}/about/`, `${ORIGIN}/contact/`))
    expect((await verifyBuild(out)).errors).toEqual([
      'about/index.html: expected exactly one <h1>, found 2.',
      `about/index.html: canonical ${ORIGIN}/elsewhere/?p=1 is not the path it is served at.`,
      'about/index.html: og:url does not match the canonical.',
      'about/index.html: missing og:title.',
      'about/index.html: missing og:description.',
      'about/index.html: missing og:image.',
      'about/index.html: missing twitter:card.',
      'contact/index.html: missing <link rel="canonical">.',
      'contact/index.html: missing og:title.',
      'contact/index.html: missing og:description.',
      'contact/index.html: missing og:image.',
      'contact/index.html: missing twitter:card.',
    ])
  })

  it('flags a sitemap with missing, extra, duplicate or malformed entries', async () => {
    site()
    write(
      'sitemap.xml',
      sitemap(`${ORIGIN}/`, `${ORIGIN}/`, `${ORIGIN}/gone/`, `${ORIGIN}/about/#top`)
    )
    expect((await verifyBuild(out)).errors).toEqual([
      'sitemap.xml: lists / more than once.',
      `sitemap.xml: ${ORIGIN}/about/#top is not a plain http(s) URL.`,
      'sitemap.xml: missing /about/.',
      'sitemap.xml: lists /gone/, which is not a page.',
    ])
  })

  it('flags robots.txt pointing outside the base path, and missing files', async () => {
    site('/base')
    write('robots.txt', `Sitemap: ${ORIGIN}/sitemap.xml\n`)
    expect((await verifyBuild(out, '/base')).errors).toEqual([
      `robots.txt: Sitemap ${ORIGIN}/sitemap.xml is not /base/sitemap.xml.`,
    ])
    rmSync(join(out, 'robots.txt'))
    rmSync(join(out, 'sitemap.xml'))
    expect((await verifyBuild(out, '/base')).errors).toEqual([
      'robots.txt: missing.',
      'sitemap.xml: missing.',
    ])
  })
})
