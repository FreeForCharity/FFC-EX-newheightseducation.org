import { test, expect } from '@playwright/test'
import { testConfig } from './test.config'

/**
 * Social Links Tests
 *
 * The site's own footer -- the green strip New Heights Educational Group's
 * captured pages bring with them -- is where their accounts are linked. The
 * template's marketing footer used to link them too, on every page, but it was
 * a SECOND footer stacked under the charity's own and `src/app/layout.tsx` now
 * renders the slim `ffc-footer` attribution strip instead (policy links and the
 * required "Supported by" credit, no social icons).
 *
 * So these assert against the whole page rather than a `<footer>` element, and
 * against `/contact-us/` rather than `/`: `/` is currently a mis-captured page
 * (the publications subdomain's, tracked upstream in
 * FreeForCharity/FFC-Cloudflare-Automation#1372) and carries no captured footer
 * at all, so an assertion there would be measuring that defect rather than this
 * one. `/contact-us/` is the charity's own contact page and is where a visitor
 * would look for these anyway.
 */
const PAGE_WITH_CHARITY_FOOTER = '/contact-us/'

test.describe('Social Links', () => {
  test('should not contain Google+ social link', async ({ page }) => {
    await page.goto(PAGE_WITH_CHARITY_FOOTER)

    await expect(page.locator('a[href*="plus.google.com"]')).toHaveCount(0)
    await expect(page.locator('a[aria-label="Google Plus"]')).toHaveCount(0)
  })

  test('links every social account this site has configured', async ({ page }) => {
    // Iterated rather than named platform by platform. The template asserted
    // facebook/twitter/linkedin/github by name and by hard-coded URL, so a
    // charity whose accounts are a different set -- NHEG's fourth is YouTube,
    // not GitHub -- could only be accommodated by editing the spec. Driving off
    // siteConfig makes the property "the accounts this site claims are actually
    // reachable from it", which is the one worth holding.
    await page.goto(PAGE_WITH_CHARITY_FOOTER)

    expect(testConfig.socialLinks.length).toBeGreaterThan(0)

    for (const { url, ariaLabel } of testConfig.socialLinks) {
      // Matched on host + path, not on the whole URL: the capture rewrote some
      // of these to their canonical form (www., https) and a whole-string match
      // would fail on a link that works. Counted rather than `.first()` —
      // `.first()` is a locator of one element whichever way the page went, so
      // asserting a count on it would have passed against an empty page.
      const { host, pathname } = new URL(url)
      const count = await page.locator(`a[href*="${host}${pathname}"]`).count()
      expect(count, `links to ${ariaLabel} (${url})`).toBeGreaterThan(0)
    }
  })
})
