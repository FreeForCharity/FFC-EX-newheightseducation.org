/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const ARCHIVE = path.join(ROOT, 'docs', 'live-archive', '2026-10-02')
const BOOKS = path.join(ROOT, 'src', 'clone-content', 'publications', 'books')
const RELEASE =
  'https://github.com/FreeForCharity/FFC-EX-newheightseducation.org/releases/download/publications-pdfs-2026-10-04/'

type Source = {
  page: string
  option: string
  source: string | null
  local?: string
  bytes?: number
  sha256?: string
}
type Asset = { page: string; asset: string; url: string; bytes: number; sha256: string }

const sources: Source[] = JSON.parse(
  fs.readFileSync(path.join(ARCHIVE, 'dflip-sources.json'), 'utf8')
)
const assets: Asset[] = JSON.parse(
  fs.readFileSync(path.join(ARCHIVE, 'publications-pdfs.json'), 'utf8')
)
const assetFor = new Map(assets.map((a) => [a.page, a]))
const slugOf = (page: string) => new URL(page).pathname.replace(/^\/books\/|\/$/g, '')
const read = (slug: string) => fs.readFileSync(path.join(BOOKS, `${slug}.html`), 'utf8')
const served = (p: string) => fs.existsSync(path.join(ROOT, 'public', p))

describe('publications flipbooks', () => {
  it('covers all 85 book pages', () => {
    expect(sources).toHaveLength(85)
    const pages = fs.readdirSync(BOOKS).filter((f) => f.endsWith('.html'))
    expect(pages.map((f) => f.replace(/\.html$/, '')).sort()).toEqual(
      sources.map((s) => slugOf(s.page)).sort()
    )
  })

  it('lists every PDF in the release with its archived size and hash', () => {
    const withPdf = sources.filter((s) => s.source)
    expect(assets).toHaveLength(withPdf.length)
    for (const s of withPdf) {
      const a = assetFor.get(s.page)
      expect(a?.bytes).toBe(s.bytes)
      expect(a?.sha256).toBe(s.sha256)
      expect(a?.url).toBe(RELEASE + a?.asset)
    }
  })

  it.each(sources.map((s) => [slugOf(s.page), s] as const))('%s links its PDF', (slug, s) => {
    const html = read(slug)
    expect(html).not.toContain('_df_book')
    if (!s.source) {
      expect(html).toContain('<p class="ffc-flipbook-missing">')
      return
    }
    const figures = html.match(/<figure class="ffc-flipbook">[\s\S]*?<\/figure>/g) ?? []
    expect(figures).toHaveLength(1)
    const figure = figures[0] ?? ''
    const local = Boolean(s.local && served(s.local))
    const href = local ? `%%BASE%%/${s.local}` : assetFor.get(s.page)!.url
    expect(figure.match(/href="([^"]+)"/g)).toEqual([`href="${href}"`])
    const mb = `${((s.bytes ?? 0) / 1e6).toFixed(1)} MB`
    expect(figure).toMatch(
      new RegExp(`>${local ? 'Read' : 'Download'} [^<]+ \\(PDF, ${mb}\\)</span>`)
    )
    const cover = figure.match(/<img src="%%BASE%%\/([^"]+)"/)?.[1]
    expect(cover).toBe(
      `_ffc-assets/publications.newheightseducation.org/wp-content/uploads/dflip-thumbs/${s.option.split('_').pop()}.webp`
    )
    expect(served(cover!)).toBe(true)
  })
})
