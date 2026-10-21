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

  test('home and school show the Rumble video as a real player', async ({ page }) => {
    for (const path of ['./', './school/']) {
      await page.goto(path)
      const video = page.locator('.ffc-rumble iframe[src="https://rumble.com/embed/v1o3tv6/"]')
      await expect(video).toHaveCount(1)
      expect((await video.boundingBox())?.height).toBeGreaterThan(200)
    }
  })

  test('radio shows the real show player below the logo and the episodes playlist', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./radio/')
    const players = page.locator(
      'iframe[src^="https://widget.spreaker.com/player?show_id=4114185"]'
    )
    await expect(players).toHaveCount(2)
    const logo = await page.locator('.ffc-clone img').first().boundingBox()
    const top = await players.first().boundingBox()
    expect(top!.y).toBeGreaterThanOrEqual(logo!.y + logo!.height)
    expect(Math.round(top!.height)).toBe(200)
    await expect(players.nth(1)).toHaveAttribute('src', /playlist=show/)
    expect(Math.round((await players.nth(1).boundingBox())!.height)).toBe(350)
  })

  test('the publications phone menu opens, expands EDGuide and closes, as live', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('./publications/')
    const header = page.locator('#ast-mobile-header')
    const top = header.locator('.main-header-menu > li > a')
    const years = header.locator('.menu-item-has-children > .sub-menu a')
    await expect(top.first()).toBeHidden()
    await header.locator('.menu-toggle').click()
    await expect(top).toHaveCount(6)
    for (const link of await top.all()) await expect(link).toBeVisible()
    await expect(years.first()).toBeHidden()
    await header.locator('.menu-item-has-children > .ast-menu-toggle').click()
    await expect(years).toHaveCount(12)
    for (const link of await years.all()) await expect(link).toBeVisible()
    await header.locator('.menu-toggle').click()
    await expect(top.first()).toBeHidden()
  })

  // Measured on the live site on 2026-10-20: the button wraps to fit, as live.
  test('the publications header button sits where live puts it at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('./publications/')
    const box = await page.locator('#ast-desktop-header .ast-custom-button').boundingBox()
    expect(Math.abs(box!.x - 1175)).toBeLessThanOrEqual(2)
    expect(Math.abs(box!.width - 70)).toBeLessThanOrEqual(2)
  })

  test('checked links are no longer struck through (#26)', async ({ page }) => {
    await page.goto('./school/online-courses/discounted-and-free-online-classes/')
    await expect(page.locator('.ffc-clone a.broken_link')).toHaveCount(0)
    const struck = await page
      .locator('.ffc-clone a')
      .evaluateAll(
        (links) =>
          links.filter((a) => getComputedStyle(a).textDecorationLine.includes('line-through'))
            .length
      )
    expect(struck).toBe(0)
    await expect(
      page.locator('a[href="https://www.izzit.org/lessons/lesson.php?lesson=first_amendment"]')
    ).toHaveCount(1)
  })

  test('publication cards have bold titles and plain Read More links', async ({ page }) => {
    await page.goto('./publications/books/')
    const title = page.locator('article .entry-title a').first()
    await expect(title).toHaveCSS('font-weight', '700')
    const more = page.locator('article p.read-more a').first()
    await expect(more).toHaveCSS('text-decoration-line', 'none')
  })
})
