/**
 * @jest-environment node
 */
import { demoteFooterLandmark } from '../../scripts/demote-clone-footer-landmark.mjs'

const CAPTURED =
  '<section id="mk-footer" class="" role="contentinfo" itemscope="itemscope" itemtype="https://schema.org/WPFooter" >'

describe('demoteFooterLandmark', () => {
  it('removes role="contentinfo" from the captured mk-footer section only', () => {
    expect(demoteFooterLandmark(CAPTURED)).toBe(
      '<section id="mk-footer" class="" itemscope="itemscope" itemtype="https://schema.org/WPFooter" >'
    )
  })

  it('leaves other contentinfo landmarks alone', () => {
    const other = '<footer role="contentinfo"><a href="/terms-of-service/">Terms</a></footer>'
    expect(demoteFooterLandmark(other)).toBe(other)
  })

  it('is idempotent', () => {
    const once = demoteFooterLandmark(CAPTURED)
    expect(demoteFooterLandmark(once)).toBe(once)
  })
})
