import { test, expect } from '@playwright/test'

// Static search (#49): the forms submit to /search/, and Pagefind answers
// from the index built after the export.
test.describe('site search', () => {
  test('finds pages for a query', async ({ page }) => {
    await page.goto('/search/?s=reading')
    const results = page.locator('#ffc-search .pagefind-ui__result-link')
    await expect(results.first()).toBeVisible({ timeout: 15000 })
    expect(await results.count()).toBeGreaterThan(3)
    await expect(results.first()).toHaveAttribute('href', /^\/[a-z0-9-]/)
  })

  test('the header icon opens the overlay, which searches on Enter', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/contact-us/')
    const trigger = page.locator('.main-nav-side-search .mk-fullscreen-trigger')
    await trigger.click()
    const overlay = page.locator('.mk-fullscreen-search-overlay')
    await expect(overlay).toHaveClass(/mk-fullscreen-search-overlay-show/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const input = page.locator('#mk-fullscreen-search-input')
    await expect(input).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(overlay).not.toHaveClass(/mk-fullscreen-search-overlay-show/)
    await expect(trigger).toBeFocused()
    await trigger.click()
    await input.fill('volunteer')
    await input.press('Enter')
    await expect(page).toHaveURL(/\/search\/\?s=volunteer$/)
  })
})
