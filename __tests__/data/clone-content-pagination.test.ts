/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { CONTROLS, articleSpan, themeOf } from '../../scripts/paginate-archives.mjs'
import { MAGIC_QUOTE } from '../../scripts/repair-magic-quotes.mjs'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')
const APP_DIR = path.join(process.cwd(), 'src', 'app')

function files(dir: string, ext: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(full, ext)
    return entry.name.endsWith(ext) ? [full] : []
  })
}

// Archive -> its numbered pages, from the fragments on disk.
const archives = new Map<string, number[]>()
for (const file of files(CONTENT_DIR, '.html')) {
  const m = path.relative(CONTENT_DIR, file).match(/^(.+)\/page\/(\d+)\.html$/)
  if (m) archives.set(m[1], [...(archives.get(m[1]) ?? []), Number(m[2])])
}
const read = (archive: string, n: number) =>
  fs.readFileSync(
    path.join(CONTENT_DIR, n === 1 ? `${archive}.html` : `${archive}/page/${n}.html`),
    'utf8'
  )
const href = (archive: string, n: number) =>
  n === 1 ? `%%BASE%%/${archive}/` : `%%BASE%%/${archive}/page/${n}/`

// The radio host's WordPress install kept its default "Hello world!" post,
// which no archive on the live site linked either.
const UNLISTED = new Set(['/radio/uncategorized/hello-world/'])

describe('archive pagination', () => {
  it('finds the paginated archives', () => {
    expect(archives.size).toBe(20)
  })

  it('has as many archive pages as the live crawl found on each host', () => {
    const crawl: Record<string, { paginated: number }> = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'docs/live-archive/2026-10-02/crawl.json'), 'utf8')
    )
    // The homepage's /page/2/ to /page/64/ rendered the front page with no
    // control linking to them, so they are left to the redirects (#59).
    const HOMEPAGE_PAGES = 63
    const hostOf = (archive: string) => {
      const section = archive.split('/')[0]
      return ['school', 'publications', 'radio'].includes(section)
        ? `${section}.newheightseducation.org`
        : 'newheightseducation.org'
    }
    const generated: Record<string, number> = {}
    for (const [archive, pages] of archives) {
      generated[hostOf(archive)] = (generated[hostOf(archive)] ?? 0) + pages.length
    }
    for (const [host, { paginated }] of Object.entries(crawl)) {
      const skipped = host === 'newheightseducation.org' ? HOMEPAGE_PAGES : 0
      expect([host, (generated[host] ?? 0) + skipped]).toEqual([host, paginated])
    }
  })

  it.each([...archives].map(([a, pages]) => [a, pages] as const))(
    '%s has every page from 2 to its last',
    (archive, pages) => {
      const max = Math.max(...pages)
      expect([...pages].sort((x, y) => x - y)).toEqual(
        Array.from({ length: max - 1 }, (_, i) => i + 2)
      )
      for (const n of [1, ...pages]) {
        expect(
          fs.existsSync(path.join(APP_DIR, archive, n === 1 ? '' : `page/${n}`, 'page.tsx'))
        ).toBe(true)
      }
    }
  )

  it.each([...archives].map(([a, pages]) => [a, Math.max(...pages)] as const))(
    "%s links each page's control to real pages",
    (archive, max) => {
      const valid = new Set(Array.from({ length: max }, (_, i) => href(archive, i + 1)))
      for (let n = 1; n <= max; n++) {
        const html = read(archive, n)
        const theme = themeOf(html) as keyof typeof CONTROLS
        const control = html.match(CONTROLS[theme])?.[0] ?? ''
        expect(control).not.toBe('')
        const links = [...control.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1])
        expect(links.filter((l) => !valid.has(l))).toEqual([])
        const current = control.match(/<[^>]*aria-current="page"[^>]*>[^<]*/g) ?? []
        expect(current).toHaveLength(1)
        expect(current[0]).toMatch(new RegExp(`>\\s*${n}\\s*$`))
      }
    }
  )

  it('leaves no live-site URL in the loops it added', () => {
    const LIVE = /(?:src|href)="(?:https?:)?\/\/(?:www\.)?(?:[a-z]+\.)?newheightseducation\.org/
    const offenders = [...archives].flatMap(([archive, pages]) =>
      pages
        .filter((n) => {
          const html = read(archive, n)
          const span = articleSpan(html)
          return !span || LIVE.test(html.slice(span[0], span[1]))
        })
        .map((n) => `${archive}/page/${n}`)
    )
    expect(offenders).toEqual([])
  })

  it('reaches every post from an archive', () => {
    const posts = files(APP_DIR, 'page.tsx')
      .filter((f) =>
        (fs.readFileSync(f, 'utf8').match(/className="([^"]*)"/)?.[1] ?? '')
          .split(/\s+/)
          .includes('single-post')
      )
      .map((f) => `/${path.relative(APP_DIR, path.dirname(f))}/`)
    expect(posts.length).toBeGreaterThan(350)
    const ARCHIVE =
      /^(?:category|author|tag|publications\/(?:category|author|books))\/|^nheg-blog(?:\.html|\/)/
    const linked = new Set<string>()
    for (const file of files(CONTENT_DIR, '.html')) {
      if (!ARCHIVE.test(path.relative(CONTENT_DIR, file))) continue
      const html = fs.readFileSync(file, 'utf8')
      const span = articleSpan(html)
      const loop = span ? html.slice(span[0], span[1]) : ''
      for (const m of loop.matchAll(/href="%%BASE%%(\/[^"#?]*)/g)) linked.add(m[1])
    }
    expect(posts.filter((p) => !linked.has(p) && !UNLISTED.has(p))).toEqual([])
  })

  it('shows no magic-quote backslash before an apostrophe or quote', () => {
    const offenders = files(CONTENT_DIR, '.html').filter((f) =>
      new RegExp(MAGIC_QUOTE.source).test(fs.readFileSync(f, 'utf8'))
    )
    expect(offenders.map((f) => path.relative(CONTENT_DIR, f))).toEqual([])
    const quotedClass = files(CONTENT_DIR, '.html').filter((f) =>
      /\sclass="[^"]*&quot;/.test(fs.readFileSync(f, 'utf8'))
    )
    expect(quotedClass.map((f) => path.relative(CONTENT_DIR, f))).toEqual([])
  })
})
