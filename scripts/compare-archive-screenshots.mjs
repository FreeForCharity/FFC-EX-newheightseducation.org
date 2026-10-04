#!/usr/bin/env node
/**
 * The #62 fidelity audit. Renders the export at the URLs and viewports the
 * live site was screenshotted at before Bluehost lapsed (#41), scores each
 * pair with verify-visual's diff, and writes side-by-side images for a person
 * to read. The score screens; it does not judge.
 *
 *   node scripts/compare-archive-screenshots.mjs --baseline <unzipped screenshots dir> \
 *     --export http://localhost:3000 --out <dir>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { bandRatios, diffRatio } from './verify-visual.mjs'

const SECTIONS = {
  'school.newheightseducation.org': '/school',
  'publications.newheightseducation.org': '/publications',
  'radio.newheightseducation.org': '/radio',
}

/** Live pages a ruling removed, and why. */
export const REMOVED = {
  '/cart/': 'the store is a catalog that links to GiveBacks (#54)',
  '/donor-dashboard-2/': 'GiveWP was replaced by Zeffy (#55)',
}

/** The export route for an archived live URL, or null if it was removed. */
export function exportRouteFor(url) {
  const { host, pathname, search } = new URL(url)
  if (host === 'newheightseducation.org' && pathname in REMOVED) return null
  if (search.startsWith('?s=')) return `/search/${search}`
  return `${SECTIONS[host] ?? ''}${pathname}${search}`
}

/** Nearest-neighbour downscale to `width`, for a reviewable composite. */
export function scaleTo(png, width) {
  if (png.width <= width) return png
  const ratio = width / png.width
  const height = Math.max(1, Math.round(png.height * ratio))
  const out = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    const sy = Math.min(png.height - 1, Math.floor(y / ratio))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(png.width - 1, Math.floor(x / ratio))
      png.data.copy(
        out.data,
        (y * width + x) * 4,
        (sy * png.width + sx) * 4,
        (sy * png.width + sx) * 4 + 4
      )
    }
  }
  return out
}

/** Live on the left, export on the right, each scaled to `width`, on white. */
export function sideBySide(live, exported, width = 600, gap = 16) {
  const a = scaleTo(live, width)
  const b = scaleTo(exported, width)
  const out = new PNG({ width: a.width + gap + b.width, height: Math.max(a.height, b.height) })
  out.data.fill(255)
  PNG.bitblt(a, out, 0, 0, a.width, a.height, 0, 0)
  PNG.bitblt(b, out, 0, 0, b.width, b.height, a.width + gap, 0)
  return out
}

async function main() {
  const arg = (name) => process.argv[process.argv.indexOf(`--${name}`) + 1]
  const baseline = arg('baseline')
  const origin = arg('export').replace(/\/$/, '')
  const out = arg('out')
  mkdirSync(out, { recursive: true })
  const { URLS, VIEWPORTS, slug } = await import('./archive-live-screenshots.mjs')
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const report = []
  for (const url of URLS) {
    const route = exportRouteFor(url)
    if (!route) {
      report.push({ url, removed: REMOVED[new URL(url).pathname] })
      continue
    }
    const context = await browser.newContext()
    await context.addInitScript(() =>
      localStorage.setItem(
        'cookie-consent',
        JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
      )
    )
    const page = await context.newPage()
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const base = `${slug(url)}.${name}`
      try {
        await page.setViewportSize(viewport)
        await page.goto(origin + route, { waitUntil: 'load', timeout: 60000 })
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
            window.scrollTo(0, y)
            await new Promise((r) => setTimeout(r, 120))
          }
          window.scrollTo(0, 0)
        })
        await page.waitForTimeout(500)
        const exported = PNG.sync.read(await page.screenshot({ fullPage: true }))
        const live = PNG.sync.read(readFileSync(join(baseline, `${base}.png`)))
        const { ratio } = await diffRatio(live, exported)
        const bands = await bandRatios(live, exported)
        writeFileSync(join(out, `${base}.export.png`), PNG.sync.write(exported))
        writeFileSync(join(out, `${base}.side.png`), PNG.sync.write(sideBySide(live, exported)))
        report.push({
          url,
          route,
          viewport: name,
          ratio: Number(ratio.toFixed(3)),
          bands: bands.map((b) => Number(b.toFixed(3))),
          heights: [live.height, exported.height],
        })
      } catch (err) {
        report.push({ url, route, viewport: name, error: String(err).slice(0, 200) })
      }
    }
    await context.close()
  }
  await browser.close()
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(
    `Compared ${report.filter((r) => r.ratio !== undefined).length} pairs; report in ${out}.`
  )
}

if (process.argv[1] && process.argv[1].endsWith('compare-archive-screenshots.mjs')) main()
