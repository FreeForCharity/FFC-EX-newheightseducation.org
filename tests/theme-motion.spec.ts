import { test, expect, type Page } from '@playwright/test'
import reference from './fixtures/live-motion-reference.json'

const COURSE = '.' + reference.parallax.course.path

const scrollTo = async (page: Page, y: number) => {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
  await page.waitForTimeout(150)
}

const parallaxTop = async (page: Page) => {
  await page.locator('[data-vc-parallax] .vc_parallax-inner').first().waitFor({ state: 'attached' })
  return page.evaluate(() => {
    const section = document.querySelector('[data-vc-parallax]')!
    const inner = section.querySelector('.vc_parallax-inner')!
    const s = section.getBoundingClientRect()
    return ((inner.getBoundingClientRect().top - s.top) / s.height) * 100
  })
}

test.describe('theme scroll motion (#106)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
      )
    )
  })

  test('the school course hero shows its title', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(COURSE)
    const hero = page.locator('.mk-animate-element').first()
    await expect(hero).toHaveClass(/mk-in-viewport/)
    await expect
      .poll(() => hero.evaluate((el) => Number(getComputedStyle(el).opacity)))
      .toBeGreaterThan(0.99)
  })

  for (const width of [1440] as const) {
    test(`home parallax follows the live curve at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const live = reference.parallax.home.topPercentAtScroll[width]
      for (const y of ['0', '300', '600', '900'] as const) {
        await scrollTo(page, Number(y))
        expect(Math.abs((await parallaxTop(page)) - live[y]), `scrollY ${y}`).toBeLessThan(1)
      }
    })
  }

  test('home parallax moves at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto('./')
    const top = await parallaxTop(page)
    await scrollTo(page, 100)
    expect(await parallaxTop(page)).toBeGreaterThan(top)
  })

  test('the course hero content fades as it scrolls away', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(COURSE)
    const opacity = () =>
      page.evaluate(() =>
        Number(
          getComputedStyle(document.querySelector('.vc_parallax-content-moving-fade .mk-grid')!)
            .opacity
        )
      )
    await scrollTo(page, 300)
    expect(await opacity()).toBe(1)
    await scrollTo(page, 1000)
    expect(await opacity()).toBe(0)
  })

  test('the Jupiter header shrinks when sticky on desktop only', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(COURSE)
    const header = page.locator('header.mk-header')
    await scrollTo(page, 40)
    await expect(header).not.toHaveClass(/a-sticky/)
    await scrollTo(page, 300)
    await expect(header).toHaveClass(/a-sticky/)
    await expect
      .poll(() =>
        page.locator('.mk-header-inner').evaluate((el) => (el as HTMLElement).offsetHeight)
      )
      .toBeLessThanOrEqual(reference.stickyHeader.course1440.innerHeight[1])
    await page.setViewportSize({ width: 390, height: 900 })
    await scrollTo(page, 310)
    await expect(header).not.toHaveClass(/a-sticky/)
  })

  test('Jupiter back-to-top appears past 400px and returns to the top', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./')
    const go = page.locator('.mk-go-top')
    await scrollTo(page, 350)
    await expect(go).not.toHaveClass(/is-active/)
    await scrollTo(page, 1500)
    await expect(go).toHaveClass(/is-active/)
    await go.click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('Astra scroll-top appears past 300px and works from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('./publications/2014-newsletter/')
    const button = page.locator('#ast-scroll-top')
    await expect(button).toBeHidden()
    await scrollTo(page, 600)
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('role', 'button')
    await button.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('keeps everything visible and still', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(COURSE)
    await expect(page.locator('html')).toHaveAttribute('data-ffc-motion-ready', '')
    expect(await page.locator('.vc_parallax-inner').count()).toBe(0)
    const hidden = await page.evaluate(
      () =>
        [...document.querySelectorAll('.mk-animate-element')].filter(
          (el) => getComputedStyle(el).opacity === '0'
        ).length
    )
    expect(hidden).toBe(0)
  })
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the course hero is visible', async ({ page }) => {
    await page.goto(COURSE)
    const opacity = await page
      .locator('.mk-animate-element')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity)
    expect(opacity).toBe('1')
  })
})
