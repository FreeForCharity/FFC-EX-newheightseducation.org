import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * One page per template (#57): no serious or critical WCAG 2.1 A/AA
 * violation on any of them. Third-party iframes are out of scope, as in
 * axe.spec.ts. Fixes belong in shared CSS (#16), never in this list.
 */
const TEMPLATES: Record<string, string> = {
  home: '/',
  page: '/contact-us/',
  post: '/nheg-news/new-heights-educational-group-volunteer-stats/',
  archive: '/category/nheg-news/',
  'archive page 2+': '/category/nheg-news/page/2/',
  author: '/author/pamela-clark/',
  tag: '/tag/national-school-choice-week/',
  shop: '/shop/',
  product: '/product/aag-duffel-bag/',
  'form page': '/volunteer-with-nheg/volunteer-form/',
  publications: '/publications/',
  'publications post': '/publications/nheg-edguide-september-october-2020/',
  flipbook: '/publications/books/nheg-edguide-march-2016/',
  school: '/school/',
  'school page': '/school/students/nheg-yearbook/',
  radio: '/radio/',
  'radio page': '/radio/manya-shukla/',
  search: '/search/?s=reading',
  policy: '/privacy-policy/',
}

test.describe('axe-core per template', () => {
  for (const [name, path] of Object.entries(TEMPLATES)) {
    test(`${name} (${path}) has no serious or critical violations`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      if (path.startsWith('/search/')) {
        await page.locator('.pagefind-ui__result-link').first().waitFor({ timeout: 15000 })
      }
      const results = await new AxeBuilder({ page })
        .include('body')
        .exclude('iframe')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const blocking = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`)
      expect(blocking).toEqual([])
    })
  }
})
