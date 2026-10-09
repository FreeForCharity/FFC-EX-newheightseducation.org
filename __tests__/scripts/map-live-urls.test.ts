/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import {
  assets,
  boilerplate,
  compare,
  contentNameFor,
  mapUrl,
  verdict,
  words,
} from '../../scripts/map-live-urls.mjs'

describe('mapUrl', () => {
  it('moves each subdomain under its own path', () => {
    expect(mapUrl('https://school.newheightseducation.org/students/')).toEqual({
      path: '/school/students/',
      how: 'prefix',
    })
    expect(mapUrl('https://radio.newheightseducation.org/')).toEqual({
      path: '/radio/',
      how: 'prefix',
    })
    expect(mapUrl('https://newheightseducation.org/contact-us/')).toEqual({
      path: '/contact-us/',
      how: 'same path',
    })
  })

  it('follows a legacy stub', () => {
    expect(mapUrl('https://newheightseducation.org/donor-dashboard-2/')).toEqual({
      path: '/support-nheg/',
      how: 'stub',
    })
    expect(mapUrl('https://school.newheightseducation.org/caldera_forms_preview/').path).toBe(
      '/school/caldera-forms-preview/'
    )
  })

  it('decodes percent-encoded slugs', () => {
    const url =
      'https://newheightseducation.org/community-news/heartfelt-thanks-special-offer-and-exciting-news-%f0%9f%8c%9f/'
    expect(mapUrl(url).how).toBe('stub')
  })
})

describe('contentNameFor', () => {
  it('finds clone-content pages and app pages', () => {
    expect(contentNameFor('/')).toBe('index')
    expect(contentNameFor('/contact-us/')).toBe('contact-us')
    expect(contentNameFor('/no-such-page/')).toBeNull()
  })
})

describe('content check', () => {
  it('ignores forms, option pickers and hidden metadata', () => {
    const html =
      '<p>Reading program</p><form><label>Afghanistan</label></form>' +
      '<select><option>Sapphire</option></select><span itemprop="url">https://x.org/a.png</span>'
    expect([...words(html)]).toEqual(['reading', 'program'])
  })

  it('matches files across sizes, formats and empty lightbox links', () => {
    const live =
      '<img src="https://x.org/u/photo-300x200.jpg"><a href="https://x.org/u/doc.pdf">Doc</a>' +
      '<a href="https://x.org/u/hidden.jpg">&nbsp;</a>'
    expect([...assets(live)]).toEqual(['photo', 'doc.pdf'])
    expect([...assets('<img src="%%BASE%%/u/photo.webp">')]).toEqual(['photo'])
  })

  it('treats what most pages share as chrome', () => {
    const sets = [new Set(['menu', 'a']), new Set(['menu', 'b']), new Set(['menu', 'c'])]
    expect([...boilerplate(sets)]).toEqual(['menu'])
  })

  it('flags lost words and files, but not product option pictures', () => {
    const common = { words: new Set(['menu']), assets: new Set<string>() }
    const live = { words: new Set(['menu', 'tutoring', 'grant']), assets: new Set(['flyer.pdf']) }
    const exported = { words: new Set(['tutoring']), assets: new Set<string>() }
    const result = compare(live, exported, common)
    expect(result).toEqual({ words: ['grant'], files: ['flyer.pdf'] })
    expect(verdict(result, '/news/')).toBe('CHECK; words: grant; files: flyer.pdf')
    expect(verdict({ words: [], files: ['62329-25'] }, '/product/mousepad/')).toBe('ok')
  })
})

describe('docs/cutover/url-map.csv', () => {
  const csv = fs.readFileSync(path.join(process.cwd(), 'docs/cutover/url-map.csv'), 'utf8')
  const rows = csv.trim().split('\n').slice(1)

  it('lists every live page with a check that passed', () => {
    expect(rows).toHaveLength(998)
    expect(rows.filter((r) => !/,(ok|redirect|app page)$/.test(r))).toEqual([])
  })
})
