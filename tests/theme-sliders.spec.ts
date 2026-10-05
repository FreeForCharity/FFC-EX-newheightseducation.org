import { test, expect, type Page } from '@playwright/test'
import reference from './fixtures/live-motion-reference.json'

const live = reference.sliders

const box = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { width: Math.round(r.width), height: Math.round(r.height) }
    })

test.describe('theme slideshows (#106)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
      )
    )
  })

  for (const width of [1440, 390] as const) {
    test(`the services flexslider shows and fades at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('.' + live.servicesFlexslider.path)
      const [w, h] = live.servicesFlexslider.size[width]
      const size = await box(page, '.wpb_flexslider')
      expect(Math.abs(size.width - w)).toBeLessThanOrEqual(4)
      expect(Math.abs(size.height - h)).toBeLessThanOrEqual(4)
      const active = page.locator('.wpb_flexslider .slides > li.flex-active-slide img')
      await expect(active).toBeVisible()
      const first = await active.getAttribute('src')
      await page.mouse.move(0, 0)
      await expect
        .poll(() => active.getAttribute('src'), {
          timeout: live.servicesFlexslider.intervalSeconds * 2000,
        })
        .not.toBe(first)
    })
  }

  for (const width of [1440, 768, 390] as const) {
    test(`the store slideshows show their products at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('.' + live.storeSwipe.path)
      const size = await box(page, '[data-mk-component="SwipeSlideshow"]')
      expect(Math.abs(size.height - live.storeSwipe.firstHeight[width])).toBeLessThanOrEqual(4)
      const visible = await page
        .locator('[data-mk-component="SwipeSlideshow"]')
        .first()
        .evaluate((root) => {
          const r = root.getBoundingClientRect()
          return [...root.querySelectorAll('.mk-slider-holder > div')].filter((s) => {
            const q = s.getBoundingClientRect()
            return q.width > 0 && q.left >= r.left - 2 && q.right <= r.right + 2
          }).length
        })
      expect(visible).toBe(live.storeSwipe.perView[width])
    })
  }

  test('the store arrows move one product and work from the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('.' + live.storeSwipe.path)
    const holder = page.locator('[data-mk-component="SwipeSlideshow"] .mk-slider-holder').first()
    const next = page.locator('.mk-swipe-slideshow-nav-4 .mk-swiper-next')
    await expect(next).toHaveAttribute('role', 'button')
    await next.focus()
    await page.keyboard.press('Enter')
    await expect(holder).toHaveAttribute('style', /translateX\(-33\.3/)
  })

  test('the offerings testimonial is visible', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('.' + live.offeringsTestimonials.path)
    await expect(page.locator('.uagb-tm__desc')).toBeVisible()
    const size = await box(page, '.uagb-slick-carousel')
    expect(Math.abs(size.height - live.offeringsTestimonials.height['1440'])).toBeLessThanOrEqual(4)
  })

  test('the radio logo strip shows ten logos and scrolls with its arrows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('.' + live.radioLogos.path)
    const size = await box(page, '.vc_images_carousel')
    expect(Math.abs(size.height - live.radioLogos['1440'].height)).toBeLessThanOrEqual(4)
    const strip = page.locator('.vc_images_carousel .vc_carousel-slideline-inner')
    await page.locator('.vc_images_carousel .vc_right').click()
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  })
})

test.describe('slideshows under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('do not autoplay and offer no pause button', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('.' + live.servicesFlexslider.path)
    const active = page.locator('.wpb_flexslider .slides > li.flex-active-slide img')
    const first = await active.getAttribute('src')
    await page.waitForTimeout(4000)
    expect(await active.getAttribute('src')).toBe(first)
    expect(await page.locator('.ffc-slider-pause').count()).toBe(0)
  })
})
