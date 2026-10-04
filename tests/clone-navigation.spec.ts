import { test, expect } from '@playwright/test'

// Captured pages are inlined into their HTML after the build, and their RSC
// payload carries only a marker (#43). Whichever way a visitor arrives, the
// page must show its content, and a cold load must not reload.
test.describe('clone content', () => {
  test('a cold load shows the page without reloading', async ({ page }) => {
    let loads = 0
    page.on('load', () => loads++)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/privacy-policy/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main .ffc-clone')).toContainText(/privacy/i)
    expect(loads).toBe(1)
    expect(errors).toEqual([])
  })

  test('a client-side navigation from a template page shows the clone content', async ({
    page,
  }) => {
    await page.goto('/cookie-policy/')
    await page.locator('footer.ffc-footer a', { hasText: 'Privacy Policy' }).click()
    await expect(page).toHaveURL(/\/privacy-policy\/?$/)
    await expect(page.locator('main .ffc-clone')).toContainText(/privacy/i)
    await expect(page.locator('main .ffc-clone')).not.toContainText('ffc-clone:')
  })
})
