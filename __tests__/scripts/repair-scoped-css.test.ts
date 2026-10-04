/**
 * @jest-environment node
 */
import { repair } from '../../scripts/repair-scoped-css.mjs'

describe('repair', () => {
  it('unprefixes an at-rule that follows a comment', () => {
    expect(repair('.ffc-clone /* latin */ @font-face{font-family:R}')).toBe(
      '/* latin */ @font-face{font-family:R}'
    )
    expect(repair('.ffc-clone a{x:y}.ffc-clone @media (min-width:768px){.ffc-clone b{x:y}}')).toBe(
      '.ffc-clone a{x:y}@media (min-width:768px){.ffc-clone b{x:y}}'
    )
  })

  it('unprefixes keyframe steps, and only inside @keyframes', () => {
    expect(
      repair(
        '@charset "UTF-8";/*!x*/@-webkit-keyframes b{.ffc-clone 0%,.ffc-clone to{a:b}}.ffc-clone to{a:b}'
      )
    ).toBe('@charset "UTF-8";/*!x*/@-webkit-keyframes b{0%,to{a:b}}.ffc-clone to{a:b}')
  })

  it('leaves correctly scoped CSS and strings alone', () => {
    const css =
      '.ffc-clone .a{content:"@media {"}@media (max-width:1px){.ffc-clone .b{c:d}}@keyframes k{0%{e:f}}'
    expect(repair(css)).toBe(css)
  })
})
