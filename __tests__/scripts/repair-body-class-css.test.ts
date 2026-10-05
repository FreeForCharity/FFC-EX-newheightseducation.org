/**
 * @jest-environment node
 */
import { repairBodyClassCss } from '../../scripts/repair-body-class-css.mjs'

const body = new Set(['home', 'ast-page-builder-template'])

describe('repairBodyClassCss', () => {
  it('lets a body-class selector match the root', () => {
    expect(
      repairBodyClassCss(
        '.ffc-clone .ast-page-builder-template .site-content > .ast-container{max-width:100%}',
        body
      )
    ).toBe(
      ':is(.ffc-clone.ast-page-builder-template, .ffc-clone .ast-page-builder-template) .site-content > .ast-container{max-width:100%}'
    )
  })

  it('leaves other classes, longer names and repaired selectors alone', () => {
    const css = '.ffc-clone .widget a{x:y}.ffc-clone .home-link{x:y}'
    expect(repairBodyClassCss(css, body)).toBe(css)
    const once = repairBodyClassCss('.ffc-clone .home .a{x:y}', body)
    expect(repairBodyClassCss(once, body)).toBe(once)
  })

  it("drops Popup Maker's unguarded scrollbar padding", () => {
    expect(
      repairBodyClassCss('a{b:c}.ffc-clone>:not([aria-modal=true]){padding-right:15px}', body)
    ).toBe('a{b:c}')
  })
})
