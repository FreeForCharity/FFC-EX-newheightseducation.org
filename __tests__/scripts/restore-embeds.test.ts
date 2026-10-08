/**
 * @jest-environment node
 */
import { restoreRumble } from '../../scripts/restore-rumble-embeds.mjs'

describe('restoreRumble', () => {
  const facade =
    '<div class="ffc-rumble"><button type="button" class="ffc-embed-facade ffc-embed-facade--video" data-ffc-embed="https://rumble.com/embed/v1o3tv6/" data-ffc-embed-title="Had &quot;Enough&quot;?">Play: Had &quot;Enough&quot;?</button></div>'

  it('turns the script placeholder into a titled player button, once', () => {
    const once = restoreRumble('<p>a</p><div id="rumble_v1o3tv6"></div>', {
      v1o3tv6: 'Had "Enough"?',
    })
    expect(once).toBe(`<p>a</p>${facade}`)
    expect(restoreRumble(once, {})).toBe(once)
  })

  it('also defers an embed iframe it wrote before', () => {
    const iframe =
      '<div class="ffc-rumble"><iframe src="https://rumble.com/embed/v1o3tv6/" title="x" loading="lazy" allowfullscreen></iframe></div>'
    expect(restoreRumble(iframe, { v1o3tv6: 'Had "Enough"?' })).toBe(facade)
  })
})
