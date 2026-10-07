import { test, expect } from '@playwright/test'

// Numbers measured on the live site on 2026-10-07 (#62, #63).
const heroLeft = [
  [390, -20],
  [1024, -5],
  [1280, -75],
  [1440, -155],
] as const

test.describe('parity with the live site (#62, #63)', () => {
  for (const [width, left] of heroLeft) {
    test(`home hero row sits at ${left}px at ${width}px wide`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const box = await page.locator('section.vc_custom_1706661090185 > .vc_row').boundingBox()
      expect(Math.abs((box?.x ?? 0) - left)).toBeLessThanOrEqual(2)
    })
  }

  test('home and school show the Rumble video', async ({ page }) => {
    for (const path of ['./', './school/']) {
      await page.goto(path)
      const video = page.locator('.ffc-rumble iframe[src="https://rumble.com/embed/v1o3tv6/"]')
      await expect(video).toHaveCount(1)
      await video.scrollIntoViewIfNeeded()
      expect((await video.boundingBox())?.height).toBeGreaterThan(200)
    }
  })

  test('radio shows the show player below the logo and the episodes playlist', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./radio/')
    const players = page.locator(
      'iframe[src^="https://widget.spreaker.com/player?show_id=4114185"]'
    )
    await expect(players).toHaveCount(2)
    expect((await players.first().boundingBox())?.y).toBeGreaterThan(600)
    await expect(players.nth(1)).toHaveAttribute('src', /playlist=show/)
    await expect(page.locator('.ffc-embed-facade--audio')).toHaveCount(0)
  })

  test('publication cards have bold titles and plain Read More links', async ({ page }) => {
    await page.goto('./publications/books/')
    const title = page.locator('article .entry-title').first()
    await expect(title).toHaveCSS('font-weight', '700')
    const more = page.locator('article p.read-more a').first()
    await expect(more).toHaveCSS('text-decoration-line', 'none')
  })
})
