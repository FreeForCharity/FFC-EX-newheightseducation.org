/**
 * @jest-environment node
 */
import { restoreRumble } from '../../scripts/restore-rumble-embeds.mjs'
import {
  lazyIframe,
  restoreSpreaker,
  spreakerLinkIframe,
} from '../../scripts/restore-spreaker-embeds.mjs'

describe('restoreRumble', () => {
  const titles = { v1o3tv6: 'Had "Enough"?' }
  const iframe =
    '<div class="ffc-rumble"><iframe src="https://rumble.com/embed/v1o3tv6/" title="Had &quot;Enough&quot;?" loading="lazy" allow="autoplay; fullscreen" allowfullscreen></iframe></div>'

  it('turns the script placeholder into a titled lazy iframe, once', () => {
    const once = restoreRumble('<p>a</p><div id="rumble_v1o3tv6"></div>', titles)
    expect(once).toBe(`<p>a</p>${iframe}`)
    expect(restoreRumble(once, titles)).toBe(once)
  })

  it('replaces a player button it wrote before', () => {
    const old =
      '<div class="ffc-rumble"><button type="button" class="ffc-embed-facade ffc-embed-facade--video" data-ffc-embed="https://rumble.com/embed/v1o3tv6/" data-ffc-embed-title="x">Play: x</button></div>'
    expect(restoreRumble(old, titles)).toBe(iframe)
  })
})

describe('webp rewrite', () => {
  it('repoints whole paths only', async () => {
    const { rewrite } = await import('../../scripts/webp-remaining-images.mjs')
    const map = new Map([['a.org/x.jpg', 'a.org/x.webp']])
    expect(rewrite('url(/a.org/x.jpg) "a.org/x.jpg?v=1" a.org/x.jpgx', map)).toBe(
      'url(/a.org/x.webp) "a.org/x.webp?v=1" a.org/x.jpgx'
    )
  })
})

describe('restoreSpreaker', () => {
  const iframe =
    '<iframe class="wp-embedded-content" title="Ep 1" src="https://widget.spreaker.com/player?episode_id=1&#038;theme=light#?secret=abc" data-secret="abc" width="1140" height="641"></iframe>'
  const link =
    '<a class="spreaker-player" href="x" data-resource="show_id=4" data-width="100%" data-height="350px" data-playlist="show">Listen to "Show" on Spreaker.</a>'
  const button = (t: string) =>
    `<button type="button" class="ffc-embed-facade ffc-embed-facade--audio" data-ffc-embed="u">Play: ${t}</button>`

  it('drops the oEmbed secret and loads lazily', () => {
    expect(lazyIframe(iframe)).toBe(
      '<iframe loading="lazy" class="wp-embedded-content" title="Ep 1" src="https://widget.spreaker.com/player?episode_id=1&#038;theme=light" width="1140" height="641"></iframe>'
    )
  })

  it('builds the player iframe a loader link described', () => {
    expect(spreakerLinkIframe(link)).toBe(
      '<iframe src="https://widget.spreaker.com/player?show_id=4&amp;playlist=show" title="Show" width="100%" height="350" frameborder="0" loading="lazy"></iframe>'
    )
  })

  it('swaps buttons for the originals in order and checks the count', () => {
    const out = restoreSpreaker(`${button('a')}<p/>${button('b')}`, `${iframe}<p/>${link}`)
    expect(out).toBe(`${lazyIframe(iframe)}<p/>${spreakerLinkIframe(link)}`)
    expect(() => restoreSpreaker(button('a'), '')).toThrow()
  })
})
