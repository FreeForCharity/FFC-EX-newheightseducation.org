/**
 * @jest-environment node
 */
import { PNG } from 'pngjs'
import { exportRouteFor, scaleTo, sideBySide } from '../../scripts/compare-archive-screenshots.mjs'

describe('exportRouteFor', () => {
  it('maps each live host to its section of the export', () => {
    expect(exportRouteFor('https://newheightseducation.org/contact-us/')).toBe('/contact-us/')
    expect(
      exportRouteFor('https://school.newheightseducation.org/online-courses/pre-calculus/')
    ).toBe('/school/online-courses/pre-calculus/')
    expect(exportRouteFor('https://publications.newheightseducation.org/')).toBe('/publications/')
    expect(exportRouteFor('https://radio.newheightseducation.org/pamela-clark/')).toBe(
      '/radio/pamela-clark/'
    )
  })

  it('sends WordPress search to the search page', () => {
    expect(exportRouteFor('https://newheightseducation.org/?s=reading')).toBe('/search/?s=reading')
  })

  it('skips the pages a ruling removed', () => {
    expect(exportRouteFor('https://newheightseducation.org/cart/')).toBeNull()
    expect(exportRouteFor('https://newheightseducation.org/donor-dashboard-2/')).toBeNull()
  })
})

describe('composites', () => {
  const solid = (width: number, height: number) => {
    const png = new PNG({ width, height })
    png.data.fill(0)
    return png
  }

  it('scales down to the requested width, keeping the aspect ratio', () => {
    const out = scaleTo(solid(1440, 2880), 600)
    expect([out.width, out.height]).toEqual([600, 1200])
    expect(scaleTo(solid(390, 800), 600).width).toBe(390)
  })

  it('places the two shots side by side, as tall as the taller', () => {
    const out = sideBySide(solid(1200, 1000), solid(1200, 3000), 600, 16)
    expect([out.width, out.height]).toEqual([1216, 1500])
  })
})
