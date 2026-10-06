import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import reference from './fixtures/live-motion-reference.json'

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
    const slides = page.locator('.woocommerce-product-gallery__image')
    const wrapperX = () =>
      page.evaluate(() => {
        const wrapper = document.querySelector('.woocommerce-product-gallery__wrapper')!
        return new DOMMatrix(getComputedStyle(wrapper).transform).m41
      })
    await thumbs.nth(2).click()
    await page.waitForTimeout(150)
    const width = await page.locator('.ffc-gallery-viewport').evaluate((el) => el.clientWidth)
    const mid = await wrapperX()
    expect(mid).toBeLessThan(0)
    expect(mid).toBeGreaterThan(-2 * width)
    await expect.poll(wrapperX).toBe(-2 * width)
    await expect(slides.nth(2)).not.toHaveAttribute('inert', '')
    await expect(slides.nth(0)).toHaveAttribute('inert', '')
    await page.locator('.woocommerce-product-gallery__image.ffc-current a').click()
    await expect(page.locator('.ffc-lightbox__count')).toHaveText('3 / 6')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.ffc-lightbox__count')).toHaveText('4 / 6')
    expect(await blocking(page, 'dialog.ffc-lightbox')).toEqual([])
    await page.keyboard.press('Escape')
    expect(await blocking(page)).toEqual([])
  })

  test('the gallery zoom button opens the current photo and takes focus back', async ({ page }) => {
    await page.goto(PRODUCT)
    await page.locator('.ffc-gallery-thumb').nth(1).click()
    const zoom = page.getByRole('button', { name: 'View full-size image' })
    await expect(zoom).toHaveCSS('opacity', '0')
    await zoom.focus()
    await expect(zoom).toHaveCSS('opacity', '1')
    await page.keyboard.press('Enter')
    await expect(page.locator('.ffc-lightbox__count')).toHaveText('2 / 6')
    await page.keyboard.press('Escape')
    await expect(zoom).toBeFocused()
  })

  test('the share-all button opens Share via and Copy link, as live', async ({ page }) => {
    await page.goto('./publications/why-junk-food-is-bad-for-you/')
    const more = page.locator('.ss-inline-share-wrapper .ss-share-all')
    await expect(page.locator('#ss-floating-bar .ss-share-all')).toBeVisible()
    await more.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Share via' })
    await expect(dialog).toBeVisible()
    const links = dialog.locator('.ss-popup-network a')
    await expect(links).toHaveText(reference.shareAll.networks)
    const shared =
      'https%3A%2F%2Fpublications.newheightseducation.org%2Fwhy-junk-food-is-bad-for-you%2F'
    await expect(links.nth(3)).toHaveAttribute('href', `https://mix.com/add?url=${shared}`)
    await expect(links.nth(4)).toHaveAttribute(
      'href',
      `mailto:?body=${shared}&subject=Why%20Junk%20Food%20Is%20Bad%20For%20You`
    )
    await expect(links.nth(0)).toBeFocused()
    await expect(dialog).toHaveCSS('opacity', '1')
    await expect(dialog.locator('.ss-popup')).toHaveCSS('opacity', '1')
    expect(await blocking(page, '#ss-all-networks-popup')).toEqual([])
    await links.nth(6).click()
    const copy = page.getByRole('dialog', { name: 'Copy link' })
    await expect(copy.locator('input')).toHaveValue(
      'https://publications.newheightseducation.org/why-junk-food-is-bad-for-you/'
    )
    await expect(copy.getByRole('status')).toHaveText('')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await copy.getByRole('button', { name: 'Copy' }).click()
    await expect(copy.getByRole('status')).toHaveText('Copied')
    await page.keyboard.press('Escape')
    await expect(copy).toBeHidden()
    await expect(dialog).toBeHidden()
    await expect(more).toBeFocused()
  })

  test('WPBakery toggles open from the keyboard', async ({ page }) => {
    await page.goto('./support-nheg/giving-tuesday-november-27-2018/')
    const title = page.locator('.vc_toggle_title h3 > button').first()
    const content = page.locator('.vc_toggle_content').first()
    await expect(content).toBeHidden()
    await expect(page.getByRole('heading', { name: 'What is #GivingTuesday?' })).toBeVisible()
    await title.focus()
    await page.keyboard.press('Enter')
    await expect(content).toBeVisible()
    await expect(title).toHaveAttribute('aria-expanded', 'true')
  })
})
