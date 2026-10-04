import { test, expect } from '@playwright/test'

// Canva presentations load only when asked for (#57).
test('the Canva button loads the presentation in place', async ({ page }) => {
  const canva: string[] = []
  await page.route(/canva\.com/, (route) => {
    canva.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>canva</p>' })
  })
  await page.goto('/radio/')
  await page.waitForLoadState('networkidle')
  expect(canva).toEqual([])
  const button = page.locator('button.ffc-embed-facade')
  await button.scrollIntoViewIfNeeded()
  await button.click()
  const frame = page.locator('iframe.ffc-embed-frame')
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.canva\.com\/design\//)
  await expect(frame).toHaveAttribute('title', 'New Heights Show on Education')
})
