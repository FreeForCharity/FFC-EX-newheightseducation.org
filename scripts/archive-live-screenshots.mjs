#!/usr/bin/env node
/**
 * Full-page screenshots of the live site, one URL per template and section at
 * three viewports: the fidelity baseline for #62 once WordPress is gone (#41).
 *
 * Run: node scripts/archive-live-screenshots.mjs <outDir>
 */
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const APEX = 'https://newheightseducation.org'
const SCHOOL = 'https://school.newheightseducation.org'
const PUBLICATIONS = 'https://publications.newheightseducation.org'
const RADIO = 'https://radio.newheightseducation.org'

export const URLS = [
  `${APEX}/`,
  `${APEX}/who-we-are/`,
  `${APEX}/who-we-are/nheg-team/`,
  `${APEX}/nheg-educational-programs/`,
  `${APEX}/nheg-educational-programs/virtual-reading-program/`,
  `${APEX}/contact-us/`,
  `${APEX}/volunteer-with-nheg/volunteer-form/`,
  `${APEX}/nheg-educational-programs/nheg-tutoring-program/nheg-tutoring-request-form/`,
  `${APEX}/first-book-access-request/`,
  `${APEX}/support-nheg/`,
  `${APEX}/donor-dashboard-2/`,
  `${APEX}/events/`,
  `${APEX}/nheg-blog/`,
  `${APEX}/category/nheg-news/`,
  `${APEX}/category/nheg-news/page/2/`,
  `${APEX}/educational-articles/games-and-learning/`,
  `${APEX}/author/heatherruggiero/`,
  `${APEX}/tag/national-school-choice-week/`,
  `${APEX}/shop/`,
  `${APEX}/product-category/nheg-collections/`,
  `${APEX}/product/unisex-heavy-cotton-tee/`,
  `${APEX}/cart/`,
  `${APEX}/?s=reading`,
  `${SCHOOL}/`,
  `${SCHOOL}/online-courses/pre-calculus/`,
  `${SCHOOL}/affordable-genealogy/`,
  `${SCHOOL}/recommended-videos-for-education/`,
  `${PUBLICATIONS}/`,
  `${PUBLICATIONS}/books/`,
  `${PUBLICATIONS}/books/nheg-edguide-may-june-2024/`,
  `${PUBLICATIONS}/nheg-edguide-september-october-2026/`,
  `${PUBLICATIONS}/category/nheg-edguide/2015-nheg-edguide/`,
  `${PUBLICATIONS}/e-a-s-y-toons/`,
  `${RADIO}/`,
  `${RADIO}/pamela-clark/`,
  `${RADIO}/uncategorized/hello-world/`,
]

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
}

const slug = (url) => {
  const { host, pathname, search } = new URL(url)
  return `${host}${pathname}${search}`.replace(/[^a-z0-9]+/gi, '_').replace(/_$/, '')
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('archive-live-screenshots.mjs')
if (invokedDirectly) {
  const out = process.argv[2]
  if (!out) {
    console.error('usage: archive-live-screenshots.mjs <outDir>')
    process.exit(1)
  }
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch()
  const index = []
  for (const url of URLS) {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({ viewport })
      const page = await ctx.newPage()
      const file = `${slug(url)}.${name}.png`
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: 90000 })
        await page.waitForTimeout(3000)
        await page.screenshot({ path: join(out, file), fullPage: true })
        index.push({ url, viewport: name, file, status: res?.status() })
      } catch (err) {
        index.push({ url, viewport: name, error: String(err).slice(0, 200) })
      }
      await ctx.close()
    }
  }
  await browser.close()
  writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  console.log(`${index.filter((i) => i.file).length} of ${index.length} screenshots`)
}
