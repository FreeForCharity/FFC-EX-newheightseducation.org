import { test, expect } from '@playwright/test'

const cases = [
  ['page/7/', /^(?!.*\/page\/).*\/$/],
  ['cart/', /\/shop\/$/],
  ['who-we-are/books/unraveling-reading/', /\/who-we-are\/nheg-books\/unraveling-reading\/$/],
  ['nheg-radio-show/', /\/category\/nheg-radio-show\/$/],
] as const

test.describe('legacy WordPress URLs (#59)', () => {
  for (const [from, to] of cases) {
    test(`${from} lands on its page`, async ({ page }) => {
      await page.goto(`./${from}`)
      await expect(page).toHaveURL(to)
      await expect(page.locator('h1')).toHaveCount(1)
    })
  }
})
