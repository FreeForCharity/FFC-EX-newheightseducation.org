/**
 * @jest-environment node
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { assetRefs, checkRef, checkOut } from '../../scripts/check-asset-origins.mjs'

describe('assetRefs', () => {
  it('collects src, srcset, poster, asset links and inline CSS urls', () => {
    const html = `
      <img src="/a.png" srcset="/a-1.png 1x, /a-2.png 2x">
      <video poster="/p.jpg"><source src="/v.mp4"></video>
      <script src="/s.js"></script>
      <link rel="stylesheet" href="/c.css">
      <div style="background:url(&#039;/bg.jpg&#039;)"></div>
      <style>.x{background:url("/s.svg")}</style>`
    expect(assetRefs(html).sort()).toEqual(
      [
        '/a.png',
        '/a-1.png',
        '/a-2.png',
        '/p.jpg',
        '/v.mp4',
        '/s.js',
        '/c.css',
        '/bg.jpg',
        '/s.svg',
      ].sort()
    )
  })

  it('skips what a browser with JavaScript on never fetches', () => {
    const html = `
      <noscript><img src="//cdn.example.org/badge.gif"></noscript>
      <script>var u = "<img src='//cdn.example.org/x.png'>"</script>
      <!-- <img src="//cdn.example.org/old.png"> -->
      <link rel="preconnect" href="https://cdn.example.org">
      <link rel="dns-prefetch" href="https://cdn.example.org">
      <a href="https://example.org/page">link</a>
      <img src="data:image/gif;base64,R0lGOD">`
    expect(assetRefs(html)).toEqual([])
  })

  it('handles end tags with attributes and nested or unclosed comments', () => {
    const html = `
      <script>var u = "<img src='//cdn.example.org/a.png'>"</script\t\n bar>
      <noscript><img src="//cdn.example.org/b.gif"></noscript foo>
      <!<!-- x -->-- <img src="//cdn.example.org/c.png"> -->
      <!-- <img src="//cdn.example.org/d.png">`
    expect(assetRefs(html)).toEqual([])
  })

  it('splits srcset candidates separated by a bare comma', () => {
    expect(
      assetRefs('<img srcset="data:image/png;base64,AAA= 1x,//cdn.example.org/b.png 2x">')
    ).toEqual(['//cdn.example.org/b.png'])
    expect(assetRefs('<img srcset="/a.png 1x,/b.png 2x,/c.png, /d.png">')).toEqual([
      '/a.png',
      '/b.png',
      '/c.png',
      '/d.png',
    ])
  })

  it('decodes HTML entities in attribute URLs', () => {
    expect(assetRefs('<img src="/a.jpg?s=1&#038;d=mm">')).toEqual(['/a.jpg?s=1&d=mm'])
  })
})

describe('checkRef', () => {
  const ctx = (files: string[], basePath = '') => ({
    pagePath: `${basePath}/news/post/`,
    basePath,
    exists: (p: string) => files.includes(p),
  })

  it('flags an off-site host the CSP does not name', () => {
    expect(checkRef('//cdn.tutors.com/a.png', ctx([]))).toBe('off-site //cdn.tutors.com/a.png')
  })

  it('allows only the hosts the CSP names, not their sibling subdomains', () => {
    for (const ref of [
      'https://evil.googletagmanager.com/x.js',
      'https://unrelated.facebook.net/x.js',
      'https://foo.zeffy.com/x.js',
      'https://google-analytics.com/g.js',
      'https://clarity.ms/c.js',
      'https://www.googletagmanager.com:444/gtm.js',
    ]) {
      expect(checkRef(ref, ctx([]))).toBe(`off-site ${ref}`)
    }
    expect(checkRef('https://region1.google-analytics.com/g.js', ctx([]))).toBeUndefined()
    expect(checkRef('https://c.clarity.ms/c.js', ctx([]))).toBeUndefined()
  })

  it('allows the analytics and widget hosts', () => {
    expect(checkRef('https://www.googletagmanager.com/gtm.js', ctx([]))).toBeUndefined()
    expect(checkRef('https://widgets.guidestar.org/w.js', ctx([]))).toBeUndefined()
  })

  it('resolves same-origin paths against the page and the base path', () => {
    const files = ['/img/a.png', '/news/b.png']
    expect(checkRef('/img/a.png', ctx(files))).toBeUndefined()
    expect(checkRef('../b.png', ctx(files))).toBeUndefined()
    expect(checkRef('/base/img/a.png', ctx(files, '/base'))).toBeUndefined()
    expect(checkRef('/img/missing.png', ctx(files))).toBe('missing /img/missing.png')
  })

  it('flags a path that escapes the base path', () => {
    expect(checkRef('../../../wp-content/x.svg', ctx([], '/base'))).toBe(
      'outside the base path ../../../wp-content/x.svg'
    )
  })
})

describe('checkOut', () => {
  let out = ''
  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'asset-origins-'))
    mkdirSync(join(out, 'about'))
    mkdirSync(join(out, '_ffc-assets'))
    writeFileSync(join(out, '_ffc-assets', 'logo.png'), '')
    writeFileSync(join(out, '_ffc-assets', 'embed.html'), '<img src="//cdn.example.org/x.png">')
  })
  afterEach(() => rmSync(out, { recursive: true, force: true }))

  it('passes a site whose assets are all local and present', () => {
    writeFileSync(join(out, 'index.html'), '<img src="/_ffc-assets/logo.png">')
    expect(checkOut(out).size).toBe(0)
  })

  it('groups each problem with the pages it appears on', () => {
    const page = '<img src="//cdn.tutors.com/a.png"><img src="/_ffc-assets/gone.png">'
    writeFileSync(join(out, 'index.html'), page)
    writeFileSync(join(out, 'about', 'index.html'), page)
    expect(Object.fromEntries(checkOut(out))).toEqual({
      'off-site //cdn.tutors.com/a.png': ['/about/', '/'],
      'missing /_ffc-assets/gone.png': ['/about/', '/'],
    })
  })

  it('checks the url() targets of each stylesheet a page loads, relative to the stylesheet', () => {
    mkdirSync(join(out, '_ffc-assets', 'css'))
    writeFileSync(
      join(out, '_ffc-assets', 'css', 'site.css'),
      `a{background:url(../logo.png)} b{background:url("../gone.png")} /* url(skip.png) */
       i{background:url(//cdn.example.org/x.png)} u{background:url("data:,")} s{filter:url(#f)}`
    )
    writeFileSync(
      join(out, 'index.html'),
      '<link rel="stylesheet" href="/_ffc-assets/css/site.css">'
    )
    writeFileSync(
      join(out, 'about', 'index.html'),
      '<link rel="stylesheet" href="../_ffc-assets/css/site.css">'
    )
    expect(Object.fromEntries(checkOut(out))).toEqual({
      'missing ../gone.png': ['/_ffc-assets/css/site.css'],
      'off-site //cdn.example.org/x.png': ['/_ffc-assets/css/site.css'],
    })
  })

  it('resolves stylesheet paths under the base path', () => {
    mkdirSync(join(out, '_ffc-assets', 'css'))
    writeFileSync(join(out, '_ffc-assets', 'css', 'site.css'), 'a{background:url(../gone.png)}')
    writeFileSync(
      join(out, 'index.html'),
      '<link rel="stylesheet" href="/base/_ffc-assets/css/site.css">'
    )
    expect(Object.fromEntries(checkOut(out, '/base'))).toEqual({
      'missing ../gone.png': ['/base/_ffc-assets/css/site.css'],
    })
  })
})
