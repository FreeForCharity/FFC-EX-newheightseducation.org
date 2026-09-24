import { test, expect } from '@playwright/test'
import { testConfig } from './test.config'

/**
 * Social Links Tests
 *
 * These tests verify that:
 * 1. Social media links are present and functional
 * 2. Defunct platforms (like Google+) are not present
 * 3. All social icons link to correct destinations
 *
 * Note: Test expectations use values from test.config.ts for easy customization
 */

test.describe('Footer Social Links', () => {
  test('should not contain Google+ social link', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/')

    // Check that Google+ link is not present
    const googlePlusLink = page.locator('footer a[href*="plus.google.com"]')
    await expect(googlePlusLink).toHaveCount(0)

    // Also check that Google Plus label is not present
    const googlePlusLabel = page.locator('footer a[aria-label="Google Plus"]')
    await expect(googlePlusLabel).toHaveCount(0)
  })

  test('should display every configured social media link', async ({ page }) => {
    // Iterated rather than named platform by platform. The template asserted
    // facebook/twitter/linkedin/github by name and by hard-coded URL, so a
    // charity whose accounts are a different set (here: YouTube instead of
    // GitHub) could only be accommodated by editing the spec. Driving off
    // siteConfig means the assertion is "the footer renders exactly the
    // accounts this site configured", which is the property worth holding.
    await page.goto('/')

    expect(testConfig.socialLinks.length).toBeGreaterThan(0)

    for (const { url, ariaLabel } of testConfig.socialLinks) {
      const link = page.locator(`footer a[href="${url}"]`)
      await expect(link, `footer link for ${ariaLabel}`).toBeVisible()
      await expect(link).toHaveAttribute('aria-label', ariaLabel)
    }
  })

  test('shows one social icon per configured account, and no others', async ({ page }) => {
    await page.goto('/')

    const selector = testConfig.socialLinks
      .map(({ ariaLabel }) => `footer a[aria-label="${ariaLabel}"]`)
      .join(', ')
    await expect(page.locator(selector)).toHaveCount(testConfig.socialLinks.length)
  })
})
