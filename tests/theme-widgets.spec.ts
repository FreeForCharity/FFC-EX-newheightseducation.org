import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const POST = './community-news/civic-theatre-in-the-wings/'
const PRODUCT = './product/nheg-mousepad-color/'

const blocking = async (page: Page, scope = 'body') =>
  (
    await new AxeBuilder({ page })
      .include(scope)
      .exclude('iframe')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
  ).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`)

test.describe('theme widgets (#106)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() =>
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
      )
    )
  })

  test('the blog share box opens, closes on Escape and returns focus', async ({ page }) => {
    await page.goto(POST)
    const trigger = page.locator('.mk-toggle-trigger').first()
    const box = page.locator('.single-share-box').first()
    await expect(box).toBeHidden()
    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(box).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(await blocking(page, '.blog-share-container')).toEqual([])
    await page.keyboard.press('Escape')
    await expect(box).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('the featured image opens in a lightbox and Escape returns focus', async ({ page }) => {
    await page.goto(POST)
    const link = page.locator('a.mk-lightbox').first()
    await link.click({ force: true })
    const dialog = page.locator('dialog.ffc-lightbox')
    await expect(dialog).toBeVisible()
    expect(page.url()).toContain('/community-news/civic-theatre-in-the-wings/')
    await expect(dialog.locator('img')).toHaveJSProperty('complete', true)
    expect(
      await dialog.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)
    ).toBeGreaterThan(0)
    expect(await blocking(page, 'dialog.ffc-lightbox')).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(link).toBeFocused()
  })

  test('product tabs show one panel and follow the arrow keys', async ({ page }) => {
    await page.goto(PRODUCT)
    const panels = page.locator('.woocommerce-Tabs-panel')
    await expect(panels.nth(0)).toBeVisible()
    await expect(panels.nth(1)).toBeHidden()
    const tab = page.locator('a[role="tab"]').first()
    await tab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('a[role="tab"]').nth(1)).toBeFocused()
    await expect(panels.nth(0)).toBeHidden()
    await expect(panels.nth(1)).toBeVisible()
  })

  test('product gallery thumbnails switch the photo and open the lightbox', async ({ page }) => {
    await page.goto(PRODUCT)
    const thumbs = page.locator('.ffc-gallery-thumb')
    await expect(thumbs).toHaveCount(6)
    await thumbs.nth(2).click()
    await expect(page.locator('.woocommerce-product-gallery__image').nth(2)).toBeVisible()
    await expect(page.locator('.woocommerce-product-gallery__image').nth(0)).toBeHidden()
    await page.locator('.woocommerce-product-gallery__image.ffc-current a').click()
    await expect(page.locator('.ffc-lightbox__count')).toHaveText('3 / 6')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.ffc-lightbox__count')).toHaveText('4 / 6')
    expect(await blocking(page, 'dialog.ffc-lightbox')).toEqual([])
    await page.keyboard.press('Escape')
    expect(await blocking(page)).toEqual([])
  })

  test('WPBakery toggles open from the keyboard', async ({ page }) => {
    await page.goto('./support-nheg/giving-tuesday-november-27-2018/')
    const title = page.locator('.vc_toggle_title').first()
    const content = page.locator('.vc_toggle_content').first()
    await expect(content).toBeHidden()
    await title.focus()
    await page.keyboard.press('Enter')
    await expect(content).toBeVisible()
    await expect(title).toHaveAttribute('aria-expanded', 'true')
  })
})
