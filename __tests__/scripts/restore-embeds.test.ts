/**
 * @jest-environment node
 */
import { restoreRumble } from '../../scripts/restore-rumble-embeds.mjs'

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
