#!/usr/bin/env node
/**
 * Does the export LOOK like the source site?
 *
 * `verify-fidelity.mjs` compares words and titles. A page can score 1.00
 * there and render as unstyled text -- the text is all present, in order,
 * with the right title. Nothing in this repo has ever compared a pixel to
 * anything: `post-deploy-smoke.yml` takes two screenshots and uploads them as
 * artifacts for a human to look at, and `above-the-fold.spec.ts` measures DOM
 * geometry. Neither has an opinion about appearance, and neither has ever
 * seen the source site.
 *
 * This renders the same route from both origins at the same viewport and
 * diffs the pixels.
 *
 * WHAT IT CANNOT DO, stated up front because a visual diff across two
 * different servers is easy to over-trust:
 *
 *   - The export deliberately differs from the source. FFC adds a footer and
 *     a cookie banner. Those regions are masked, not scored.
 *   - A WordPress origin serves genuinely dynamic content -- recent-post
 *     lists, dates, rotating banners. Those produce real differences that are
 *     not defects.
 *   - Page heights differ, so only the first `--height` pixels are compared.
 *     A defect below that line is invisible here.
 *
 * So the number this produces is a SCREENING signal, not a verdict. Run it
 * without --strict first and read the distribution; the threshold is only
 * meaningful once you know what a healthy page scores on this pair of sites.
 *
 *   node scripts/verify-visual.mjs \
 *     --source https://newheightseducation.org \
 *     --export https://freeforcharity.github.io/FFC-EX-newheightseducation.org \
 *     --sample 10 --report visual-report.json [--strict]
 *
 * Exit codes: 0 clean (or findings without --strict), 1 findings with
 * --strict, 2 no comparison could be made.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
// pixelmatch is pinned to the v5 line deliberately: v7 is ESM-only, and under
// the jest transform a module that imports it cannot be loaded at all -- so
// pinning v7 would mean the comparison logic below could not be unit-tested.
// The two versions take the same arguments.
import pixelmatch from 'pixelmatch'
// Reused rather than reimplemented. Two functions that disagree about which
// routes came from the source would compare different populations and be
// impossible to read against each other -- and this file already learned that
// lesson once, when `unpublishedCaptures` disagreed with `capturedRoutes`
// about the route/file mapping.
import { capturedRoutes, sampleRoutes } from './verify-fidelity.mjs'

// ---------------------------------------------------------------- pure parts

/**
 * Share of pixels that differ, 0..1.
 *
 * Both images are cropped to their common width and height before comparing.
 * Without that, a one-pixel width difference throws `pixelmatch` rather than
 * scoring, and a taller source page would score as a total mismatch below the
 * fold -- a difference in page LENGTH is not a difference in appearance, and
 * conflating them makes every long page look broken.
 */
export async function diffRatio(aPng, bPng, { threshold = 0.2 } = {}) {
  const width = Math.min(aPng.width, bPng.width)
  const height = Math.min(aPng.height, bPng.height)
  if (width <= 0 || height <= 0) return { ratio: 1, width, height, diff: null }
  const a = cropTo(aPng, width, height)
  const b = cropTo(bPng, width, height)
  const diff = new PNG({ width, height })
  const changed = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold,
    includeAA: false,
  })
  return { ratio: changed / (width * height), width, height, diff }
}

/**
 * The diff ratio of each horizontal band, top to bottom.
 *
 * One number for a whole page cannot say WHAT differs, and telling the two
 * likeliest causes apart is the whole diagnosis:
 *
 *   top band high, rest low   a rotating hero -- a static export freezes one
 *                             slide, so this is expected, not a defect
 *   every band high           the stylesheet did not apply, or the page is
 *                             genuinely the wrong page
 *   bottom band high          a footer or a late-loading region
 *
 * Measured on the live pair, the home page scored 0.910 overall while four
 * other pages sat at 0.195-0.230. That one number could not separate those
 * explanations, and the diff image -- the only thing that could -- lives in a
 * CI artifact rather than in the report a reader sees first.
 */
export async function bandRatios(aPng, bPng, bands = 4) {
  const width = Math.min(aPng.width, bPng.width)
  const height = Math.min(aPng.height, bPng.height)
  if (width <= 0 || height <= 0 || bands < 1) return []
  const step = Math.floor(height / bands)
  if (step <= 0) return []
  const out = []
  for (let i = 0; i < bands; i += 1) {
    const top = i * step
    // The last band absorbs the remainder, so no rows go unexamined -- the
    // same reason `comparedPx` is reported beside `requestedViewport`: a
    // check must not quietly skip part of what it claims to cover.
    const bandHeight = i === bands - 1 ? height - top : step
    out.push(
      Number(
        (
          await diffRatio(
            cropBand(aPng, width, top, bandHeight),
            cropBand(bPng, width, top, bandHeight)
          )
        ).ratio.toFixed(4)
      )
    )
  }
  return out
}

/** A horizontal slice, for band-wise comparison. */
export function cropBand(png, width, top, height) {
  const slice = new PNG({ width, height })
  PNG.bitblt(png, slice, 0, top, width, height, 0, 0)
  return slice
}

/** A top-left crop, so two differently sized shots can be compared at all. */
export function cropTo(png, width, height) {
  if (png.width === width && png.height === height) return png
  const out = new PNG({ width, height })
  PNG.bitblt(png, out, 0, 0, width, height, 0, 0)
  return out
}

/**
 * The source URL for a built route, with an optional mount stripped.
 * Mirrors `sourceUrlFor` in verify-fidelity.mjs -- same rule, same reason.
 */
export function sourceUrlFor(route, sourceOrigin, mount = '') {
  const origin = String(sourceOrigin).replace(/\/+$/, '')
  let path = String(route)
  if (!path.startsWith('/')) path = `/${path}`
  if (mount) {
    const prefix = `/${String(mount).replace(/^\/+|\/+$/g, '')}/`
    if (path === prefix.replace(/\/$/, '') || path === prefix) path = '/'
    else if (path.startsWith(prefix)) path = `/${path.slice(prefix.length)}`
  }
  return `${origin}${path}`
}

/**
 * Is this ratio worth reporting as a finding?
 *
 * Separate from the comparison so the bar is one testable decision rather
 * than a literal buried in a loop.
 */
export const MAX_DIFF_RATIO = 0.15

export function isFinding(ratio, max = MAX_DIFF_RATIO) {
  return typeof ratio === 'number' && ratio > max
}

/** Median, for a distribution that a single outlier should not move. */
export function median(xs) {
  const s = [...xs].filter((x) => typeof x === 'number').sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

// ------------------------------------------------------------------- the CLI

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const flag = (name) => process.argv.includes(`--${name}`)

/**
 * Regions that are SUPPOSED to differ, hidden before the shot.
 *
 * Masking is a load-bearing decision, not tidying: FFC's footer and cookie
 * banner exist only on the export, and the banner is `position: fixed` over
 * ~40% of a phone viewport on a first visit. Left visible, every page would
 * diff by at least that much and the threshold would have to be raised until
 * it could no longer detect anything.
 */
const MASK_SELECTORS = [
  '.ffc-footer',
  '[data-ffc-cookie-consent]',
  '#ffc-cookie-consent',
  '[class*="cookie" i][class*="consent" i]',
  '[class*="cookie" i][class*="banner" i]',
]

async function shoot(page, url, { width, height, timeoutMs, settleMs }) {
  const res = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs })
  if (!res || res.status() >= 400) return { status: res ? res.status() : 0, png: null }
  // Lazy images only load once they scroll into view, and a page that is
  // still filling in scores as a difference. Walk down, then come back.
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
    }
    window.scrollTo(0, 0)
  })
  // Animations and carousels would otherwise be timing noise.
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;
      animation-duration:0s!important;caret-color:transparent!important}`,
  })
  await page.evaluate((sels) => {
    for (const sel of sels)
      for (const el of document.querySelectorAll(sel)) el.style.visibility = 'hidden'
  }, MASK_SELECTORS)
  await page.waitForTimeout(settleMs)
  const png = await page.screenshot({
    clip: { x: 0, y: 0, width, height },
    animations: 'disabled',
  })
  return { status: res.status(), png: PNG.sync.read(png) }
}

async function main() {
  const sourceOrigin = arg('source')
  const exportOrigin = arg('export')
  if (!sourceOrigin || !exportOrigin) {
    console.error('usage: verify-visual.mjs --source <origin> --export <origin> [options]')
    process.exit(2)
  }
  const outDir = arg('out', 'out')
  const cloneDir = arg('clone-content', join('src', 'clone-content'))
  const sampleSize = Number(arg('sample', '8'))

  // Routes are DERIVED from the build by default, not hard-coded.
  //
  // The first version shipped a literal list of NHEG paths, which is wrong in
  // two ways: it silently stops representing the site as pages come and go,
  // and it cannot be ported to another charity's repo at all -- and porting
  // these gates into 706 so every migration inherits them is the whole point.
  // `capturedRoutes` + `sampleRoutes` are the same functions the text gate
  // uses, so both gates look at the same population and their reports can be
  // read against each other.
  //
  // `--routes` still overrides, for investigating a specific page.
  //
  // Normalized up front, not per-use: `sourceUrlFor` adds a missing leading
  // slash for the source, but the export URL is built by concatenation, so
  // `--routes who-we-are/` produced `https://host.example.orgwho-we-are/` for
  // one side and a valid URL for the other -- the two origins would have been
  // compared at different paths.
  const explicit = arg('routes', '')
  const routes = (
    explicit
      ? explicit
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : sampleRoutes(capturedRoutes(outDir, cloneDir), sampleSize)
  ).map((r) => (r.startsWith('/') ? r : `/${r}`))

  if (!routes.length) {
    console.error(
      `::error::no routes to compare. With no --routes, they are derived from ${outDir} + ` +
        `${cloneDir}; build the site first.`
    )
    process.exit(2)
  }
  const mount = arg('mount', '')
  const width = Number(arg('width', '1280'))
  const height = Number(arg('height', '2000'))
  const timeoutMs = Number(arg('timeout-ms', '45000'))
  const settleMs = Number(arg('settle-ms', '1200'))
  const delayMs = Number(arg('delay-ms', '1500'))
  const maxRatio = Number(arg('max-diff', String(MAX_DIFF_RATIO)))
  const reportPath = arg('report', '')
  const diffDir = arg('diff-dir', 'visual-diffs')
  const strict = flag('strict')

  // Honoured only when set. CI runs `playwright install` and gets the pinned
  // build; a developer host may have a different one, and refusing to run
  // there would make this script unrunnable exactly where it is being written.
  const executablePath = arg('executable', process.env.VISUAL_CHROMIUM_PATH || undefined)
  // Imported here, not at module scope. The pure comparison functions above
  // are unit-tested, and those tests run before `playwright install` in CI --
  // a top-level import makes the whole module unloadable there, so the tests
  // that pin this file's decisions could not run at all.
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch(executablePath ? { executablePath } : {})
  const context = await browser.newContext({
    // As tall as the capture, NOT capped. Playwright does not reject a clip
    // taller than the viewport -- it silently clamps the image to the
    // viewport and returns successfully. Measured: viewport 1200 with
    // `clip.height: 2000` returns a 1280x1200 PNG. On the defaults that
    // meant comparing the top 1200px of every page while the report said
    // `1280x2000` -- 800px unexamined, under a label that said otherwise.
    // The self-test missed it because it runs at --height 900, where the
    // clip fits: a configuration the real run never uses.
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  mkdirSync(diffDir, { recursive: true })

  const rows = []
  try {
    for (const route of routes) {
      const srcUrl = sourceUrlFor(route, sourceOrigin, mount)
      const expUrl = `${exportOrigin.replace(/\/+$/, '')}${route}`
      let row = { route, sourceUrl: srcUrl, exportUrl: expUrl }
      try {
        const src = await shoot(page, srcUrl, { width, height, timeoutMs, settleMs })
        await page.waitForTimeout(delayMs)
        const exp = await shoot(page, expUrl, { width, height, timeoutMs, settleMs })
        if (!src.png || !exp.png) {
          row = { ...row, skipped: `source HTTP ${src.status}, export HTTP ${exp.status}` }
        } else {
          const { ratio, width: w, height: h, diff } = await diffRatio(src.png, exp.png)
          const bands = await bandRatios(src.png, exp.png)
          const name = route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/\//g, '_')
          if (diff && isFinding(ratio, maxRatio)) {
            writeFileSync(join(diffDir, `${name}.diff.png`), PNG.sync.write(diff))
            writeFileSync(join(diffDir, `${name}.source.png`), PNG.sync.write(src.png))
            writeFileSync(join(diffDir, `${name}.export.png`), PNG.sync.write(exp.png))
          }
          row = { ...row, ratio: Number(ratio.toFixed(4)), comparedPx: `${w}x${h}`, bands }
        }
      } catch (err) {
        row = { ...row, skipped: String(err && err.message ? err.message : err) }
      }
      rows.push(row)
      console.error(
        `[visual] ${route.padEnd(40)} ${
          row.skipped ? `SKIPPED ${row.skipped}` : `${(row.ratio * 100).toFixed(2)}% differing`
        }`
      )
      await page.waitForTimeout(delayMs)
    }
  } finally {
    await browser.close()
  }

  const scored = rows.filter((r) => typeof r.ratio === 'number')
  const findings = scored.filter((r) => isFinding(r.ratio, maxRatio))
  const summary = {
    checkedAt: new Date().toISOString(),
    source: sourceOrigin,
    export: exportOrigin,
    // Both, and deliberately. `requestedViewport` is what was asked for;
    // `comparedPx` is what was actually measured. They were the same number
    // until Playwright was found to silently clamp a clip taller than the
    // viewport -- the run reported 1280x2000 and compared 1280x1200. A
    // summary that can only state the request cannot show that gap, so it
    // states both and the smallest region actually compared.
    requestedViewport: `${width}x${height}`,
    routes: routes.length,
    routeSource: explicit ? 'explicit --routes' : `sampled ${routes.length} of the built site`,
    compared: scored.length,
    skipped: rows.length - scored.length,
    comparedPx: scored.length
      ? scored
          .map((r) => r.comparedPx)
          .sort(
            (a, b) =>
              Number(a.split('x')[0]) * Number(a.split('x')[1]) -
              Number(b.split('x')[0]) * Number(b.split('x')[1])
          )[0]
      : null,
    medianDiffRatio: median(scored.map((r) => r.ratio)),
    worstDiffRatio: scored.length ? Math.max(...scored.map((r) => r.ratio)) : null,
    threshold: maxRatio,
    withFindings: findings.length,
  }
  console.error(`\n[visual] ${JSON.stringify(summary, null, 1)}`)
  for (const f of findings)
    console.error(
      `::error::${f.route}: ${(f.ratio * 100).toFixed(1)}% of compared pixels differ from ` +
        `${f.sourceUrl} (threshold ${(maxRatio * 100).toFixed(0)}%). ` +
        `By band, top to bottom: ${(f.bands || []).map((b) => `${(b * 100).toFixed(0)}%`).join(' ')}. ` +
        'A high top band with the rest low usually means a rotating hero the export froze; ' +
        'every band high means the styling did not apply or the page is wrong. ' +
        'A diff image is in the run artifact.'
    )

  if (!scored.length) {
    console.error(
      '::error::no page could be compared, so this run measured nothing. That is not a pass.'
    )
    process.exit(2)
  }
  if (reportPath) {
    writeFileSync(reportPath, `${JSON.stringify({ summary, rows }, null, 2)}\n`, 'utf8')
    console.error(`[visual] report written to ${reportPath}`)
  }
  process.exit(findings.length && strict ? 1 : 0)
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('verify-visual.mjs')
if (invokedDirectly) {
  main().catch((err) => {
    console.error('::error::visual check crashed:', err)
    process.exit(2)
  })
}
