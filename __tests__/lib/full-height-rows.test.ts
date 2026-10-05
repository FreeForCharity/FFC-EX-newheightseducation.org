import { FULL_HEIGHT_ROWS_JS } from '../../src/lib/full-height-rows'

describe('FULL_HEIGHT_ROWS_JS', () => {
  const run = (width: number, top: number) => {
    document.body.innerHTML =
      '<div class="ffc-clone"><div class="vc_section vc_row-o-full-height"></div></div>'
    const row = document.querySelector<HTMLElement>('.vc_row-o-full-height')!
    row.getBoundingClientRect = () => ({ top }) as DOMRect
    Object.assign(window, { innerWidth: width, innerHeight: 900 })
    new Function(FULL_HEIGHT_ROWS_JS)()
    return row.style.minHeight
  }

  it('fills what is left of the first screen on desktop', () => {
    expect(parseFloat(run(1440, 270))).toBeCloseTo(70)
  })

  it('leaves phones and rows below the fold alone', () => {
    expect(run(390, 90)).toBe('')
    expect(run(1440, 1200)).toBe('')
  })
})
