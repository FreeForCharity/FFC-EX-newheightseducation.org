/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { relink, targetOf, SERVICE_FEES, PATHS } from '../../scripts/relink-legacy-urls.mjs'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')
const ASSETS = path.join(process.cwd(), 'public', '_ffc-assets', 'newheightseducation.org')
const NEWSLETTERS: { path: string; url: string }[] = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'docs', 'live-archive', '2026-10-02', 'newsletters.json'),
    'utf8'
  )
)

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
const offenders = (re: RegExp) => all.filter(({ html }) => re.test(html)).map(({ page }) => page)
const hrefs = (re: RegExp) => [
  ...new Set(all.flatMap(({ html }) => [...html.matchAll(re)].map((m) => m[1]))),
]

// Old site links follow the live site's own redirects (#59).
describe('legacy links', () => {
  it('no longer points at old site URLs that live redirected', () => {
    expect(
      offenders(
        /href="https?:\/\/(?:www\.)?newheightseducation\.org\/(?:nheg-radio-show\/?"|nheg-educational-programs\/program-service-fees|animation-course|parents\/events|who-we-are\/books|who-we-are\/nheg-groups|wp-content\/uploads)/i
      )
    ).toEqual([])
    expect(offenders(/href="%%BASE%%\/(?:nheg-programs|nheg-parents|who-we-are\/books)\//)).toEqual(
      []
    )
  })

  it('serves every relinked upload from the export', () => {
    const missing = hrefs(/href="%%BASE%%\/_ffc-assets\/newheightseducation\.org([^"]*)"/g).filter(
      (p) => !fs.existsSync(path.join(ASSETS, decodeURI(p)))
    )
    expect(missing).toEqual([])
  })

  it('links release newsletters only to files the release holds', () => {
    const known = new Set(NEWSLETTERS.map((n) => n.url))
    const linked = hrefs(
      /href="(https:\/\/github\.com\/[^"]*\/releases\/download\/newsletters-[^"]*)"/g
    )
    expect(linked.length).toBeGreaterThan(0)
    expect(linked.filter((u) => !known.has(u))).toEqual([])
  })
})

describe('relink', () => {
  const none = () => false

  it.each(Object.entries(PATHS))('sends %s to %s', (from, to) => {
    expect(relink(`<a href="https://www.newheightseducation.org${from}">x</a>`, none)).toBe(
      `<a href="%%BASE%%${to}">x</a>`
    )
  })

  it('follows the service fees link to the GiveBacks store', () => {
    expect(targetOf('/nheg-educational-programs/program-service-fees/', none)).toBe(SERVICE_FEES)
  })

  it('lowercases mixed-case paths to a page that exists', () => {
    expect(
      relink('<a href="https://www.NewHeightsEducation.org/who-we-are/NHEG-edguide/">x</a>', none)
    ).toBe('<a href="%%BASE%%/who-we-are/nheg-edguide/">x</a>')
  })

  it('uses the local copy of an upload, or the release for a newsletter', () => {
    expect(targetOf('/wp-content/uploads/a.jpg', () => true)).toBe(
      '%%BASE%%/_ffc-assets/newheightseducation.org/wp-content/uploads/a.jpg'
    )
    expect(targetOf('/wp-content/uploads/a.jpg', none)).toBeNull()
    expect(targetOf(NEWSLETTERS[0].path, none)).toBe(NEWSLETTERS[0].url)
  })

  it('leaves links that were already broken on live', () => {
    const html = '<a href="https://www.newheightseducation.org/who-we-are/nheg-magazine">x</a>'
    expect(relink(html, none)).toBe(html)
  })

  it('is idempotent', () => {
    const html = '<a href="http://newheightseducation.org/nheg-radio-show">x</a>'
    expect(relink(relink(html, none), none)).toBe(relink(html, none))
  })
})
