import { test, expect } from '@playwright/test'

const PAGES = ['', 'who-we-are/', 'contact-us/']
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]

test.describe('full-width rows and hero', () => {
  for (const viewport of VIEWPORTS) {
    test(`rows span the viewport with no horizontal scroll at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      for (const path of PAGES) {
        await page.goto(`./${path}`)
        const m = await page.evaluate(() => {
          const rows = [
            ...document.querySelectorAll(
              '[data-mk-full-width="true"], [data-vc-full-width="true"]'
            ),
          ]
            .filter((el) => !el.matches('section.vc_custom_1706661090185 > .vc_row'))
            .map((el) => el.getBoundingClientRect())
          return {
            rows: rows.length,
            boxed: rows.filter(
              (b) => Math.round(b.left) !== 0 || Math.round(b.width) !== window.innerWidth
            ).length,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
          }
        })
        expect(m.rows, path).toBeGreaterThan(0)
        expect(m.boxed, path).toBe(0)
        expect(m.overflow, path).toBeLessThanOrEqual(0)
      }
    })
  }

  test('home hero paints its bundled background and fills the rest of the first screen', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS[0])
    await page.goto('./')
    const hero = page.locator('[data-vc-parallax-image]').first()
    const bg = await hero.evaluate(
      (el) => getComputedStyle(el.querySelector('.vc_parallax-inner') ?? el).backgroundImage
    )
    expect(bg).toMatch(/_next\/static\/media\/nheg-home-cover/)
    const url = bg.match(/url\("?([^")]+)"?\)/)![1]
    expect((await page.request.get(url)).status()).toBe(200)
    // WPBakery's fullHeightRow: 100vh less the section's offset (#62).
    const { top, height } = await hero.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top + window.scrollY, height: r.height }
    })
    expect(height).toBeGreaterThanOrEqual(VIEWPORTS[0].height - top - 1)
  })
})
