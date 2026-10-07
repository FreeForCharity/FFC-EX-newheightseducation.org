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
  const button = page.locator('button.ffc-embed-facade:not(.ffc-embed-facade--audio)')
  await button.scrollIntoViewIfNeeded()
  await button.click()
  const frame = page.locator('iframe.ffc-embed-frame')
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.canva\.com\/design\//)
  await expect(frame).toHaveAttribute('title', 'New Heights Show on Education')
})

test('Spreaker episode players are real iframes that load lazily (#63)', async ({ page }) => {
  await page.route(/spreaker\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>player</p>' })
  )
  await page.goto('/radio/manya-shukla/')
  const player = page
    .locator('iframe[src^="https://widget.spreaker.com/player?episode_id="]')
    .first()
  await expect(player).toHaveAttribute('loading', 'lazy')
  await expect(page.locator('button.ffc-embed-facade--audio')).toHaveCount(0)
})
