/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'

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
const offenders = (re: RegExp) => all.filter(({ html }) => re.test(html)).map(({ page }) => page)

describe('third-party embeds and widgets (#57)', () => {
  it('loads Canva presentations only on request', () => {
    expect(offenders(/<iframe\b[^>]*src="https:\/\/www\.canva\.com\//)).toEqual([])
    const facades = all.flatMap(({ html }) => [
      ...html.matchAll(/<button type="button" class="ffc-embed-facade" data-ffc-embed="([^"]+)"/g),
    ])
    expect(facades).toHaveLength(2)
    for (const [, src] of facades) {
      expect(src).toMatch(/^https:\/\/www\.canva\.com\/design\/[^/]+\/[^/]+\/watch\?embed$/)
    }
  })

  it('loads Spreaker episode players only on request', () => {
    expect(offenders(/<iframe\b[^>]*src="https:\/\/widget\.spreaker\.com\//)).toEqual([])
    const players = all.flatMap(({ html }) => [
      ...html.matchAll(
        /class="ffc-embed-facade ffc-embed-facade--audio" data-ffc-embed="([^"]+)"/g
      ),
    ])
    expect(players.length).toBeGreaterThan(900)
    for (const [, src] of players) expect(src).toMatch(/^https:\/\/widget\.spreaker\.com\/player\?/)
  })

  it('embeds every Rumble video as a titled lazy iframe (#62)', () => {
    expect(offenders(/id="rumble_/)).toEqual([])
    const videos = all.flatMap(({ html }) => [
      ...html.matchAll(
        /<div class="ffc-rumble"><iframe src="https:\/\/rumble\.com\/embed\/\w+\/" title="([^"]+)" loading="lazy"/g
      ),
    ])
    expect(videos).toHaveLength(65)
    for (const [, title] of videos) expect(title).not.toBe('Rumble video')
  })

  it('has no Twitter feed widget, which the live site already showed empty', () => {
    expect(offenders(/widget_twitter|twitter\.com\/\/statuses\//)).toEqual([])
  })
})
