/**
 * @jest-environment node
 */
import { facadeSpreakerLinks } from '../../scripts/facade-spreaker-embeds.mjs'

describe('facadeSpreakerLinks', () => {
  const link =
    '<a class="spreaker-player" href="https://www.spreaker.com/show/x" data-resource="show_id=4114185" data-width="100%" data-height="350px" data-theme="light" data-playlist-continuous="true">Listen to "New Heights Show" on Spreaker.</a>'

  it('builds the player URL and keeps the height', () => {
    const out = facadeSpreakerLinks(link)
    expect(out).toContain(
      'data-ffc-embed="https://widget.spreaker.com/player?show_id=4114185&amp;theme=light&amp;playlist_continuous=true"'
    )
    expect(out).toContain('data-ffc-embed-height="350px" style="height:350px"')
    expect(out).toContain('>Play: New Heights Show</button>')
  })

  it('is safe to re-run', () => {
    const once = facadeSpreakerLinks(link)
    expect(facadeSpreakerLinks(once)).toBe(once)
  })
})
