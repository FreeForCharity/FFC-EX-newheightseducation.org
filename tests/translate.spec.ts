import { test, expect } from '@playwright/test'

// Google Translate loads only after the visitor chooses it (#49).
test.describe('translate', () => {
  test('asks before loading Google Translate, then loads it', async ({ page }) => {
    const google: string[] = []
    await page.route(/translate\.(google|googleapis)\.com/, (route) => {
      google.push(route.request().url())
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
    })
    await page.addInitScript(() =>
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
      )
    )
    await page.goto('/contact-us/')
    await page.waitForLoadState('networkidle')
    expect(google).toEqual([])

    const trigger = page.locator('#glt-translate-trigger')
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const panel = page.locator('#ffc-translate-panel')
    await expect(panel).toContainText('Google receives the text of this page')
    expect(google).toEqual([])

    await panel.getByRole('button', { name: 'Use Google Translate' }).click()
    await expect.poll(() => google.length).toBeGreaterThan(0)
    await expect(panel.locator('#flags')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Translate into Spanish' })).toBeVisible()
  })
})
