#!/usr/bin/env node
/**
 * Puts the live site and the export in the same interactive state (a menu
 * opened, a dropdown hovered), then checks both agree: the theme's state
 * (classes, aria-expanded, display) must be equal, the visible links must be
 * equal, and the screenshot of the region must diff under the scenario's
 * limit. Writes a live | export side-by-side per scenario.
 *
 * Side A is live by default; pass an export origin as --a to compare two
 * builds instead (before and after a fix).
 *
 *   node scripts/compare-live-states.mjs --b http://localhost:3000 --out <dir> \
 *     [--a live|<origin>] [--only <name substring>]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { exportRouteFor, sideBySide } from './compare-archive-screenshots.mjs'
import { MASK_SELECTORS, diffRatio } from './verify-visual.mjs'

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

/** One run per scenario and viewport, named `<name>.<viewport>`. */
export function expandScenarios(scenarios) {
  return scenarios.flatMap((s) =>
    (s.viewports ?? ['desktop']).map((v) => ({ ...s, id: `${s.name}.${v}`, viewport: v }))
  )
}

/** Where a scenario's page lives on one side: the live URL, or its route on an export. */
export function urlFor(scenario, side) {
  if (side === 'live') return scenario.url
  return side.replace(/\/$/, '') + exportRouteFor(scenario.url)
}

/** The live body's classes sit on the export's .ffc-clone root. */
export const rootSelector = (side) => (side === 'live' ? 'body' : '.ffc-clone')

/** Every field where two state snapshots disagree. */
export function stateDiff(a, b) {
  const out = []
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = JSON.stringify(a[key] ?? null)
    const y = JSON.stringify(b[key] ?? null)
    if (x !== y) out.push({ key, a: a[key] ?? null, b: b[key] ?? null })
  }
  return out
}

/** Pass/fail for one run: state and links must match, pixels under the limit when one is set. */
export function verdict({ diffs, ratio }, maxDiff) {
  if (diffs.length) return 'state-mismatch'
  if (typeof maxDiff === 'number' && ratio > maxDiff) return 'pixels'
  return 'ok'
}

/** Paints each rect a flat colour, so the same boxes on both sides compare equal. */
export function paintRects(png, rects) {
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(png.width, Math.ceil(r.x + r.width))
    const y1 = Math.min(png.height, Math.ceil(r.y + r.height))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) png.data.writeUInt32BE(0xff00ffff, (y * png.width + x) * 4)
    }
  }
  return png
}

async function snapshot(page, side, scenario) {
  return page.evaluate(
    ({ root, state, clip }) => {
      const out = {}
      for (const { sel, classes = [] } of state) {
        const el = document.querySelector(sel === 'ROOT' ? root : sel)
        if (!el) {
          out[sel] = 'missing'
          continue
        }
        const cs = getComputedStyle(el)
        out[sel] = {
          classes: classes.filter((c) => el.classList.contains(c)),
          ariaExpanded: el.getAttribute('aria-expanded'),
          display: cs.display,
          visibility: cs.visibility,
        }
      }
      const visible = (el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && el.offsetParent
      }
      out.links = clip
        .flatMap((sel) => [...document.querySelectorAll(`${sel} a`)])
        .filter(visible)
        .map((a) => a.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      return out
    },
    { root: rootSelector(side), state: scenario.state ?? [], clip: scenario.clip ?? [] }
  )
}

async function run(browser, scenario, side) {
  const context = await browser.newContext({
    userAgent: UA,
    viewport: VIEWPORTS[scenario.viewport],
  })
  await context.addInitScript(() =>
    localStorage.setItem(
      'cookie-consent',
      JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
    )
  )
  const page = await context.newPage()
  try {
    const res = await page.goto(urlFor(scenario, side), { waitUntil: 'load', timeout: 60000 })
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`)
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 100))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
    await page.addStyleTag({
      content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`,
    })
    await page.evaluate(
      (sels) =>
        sels.forEach((s) =>
          document.querySelectorAll(s).forEach((el) => (el.style.visibility = 'hidden'))
        ),
      [...MASK_SELECTORS, ...(scenario.mask ?? [])]
    )
    for (const step of scenario.steps ?? []) {
      const el = page.locator(step.click ?? step.hover ?? step.on).first()
      if (step.click) await el.click({ timeout: 5000 })
      else if (step.hover) await el.hover({ timeout: 5000 })
      else if (step.press) {
        await el.focus({ timeout: 5000 })
        await page.keyboard.press(step.press)
      }
      await page.waitForTimeout(500)
    }
    if (!scenario.steps?.some((s) => s.hover)) await page.mouse.move(0, 0)
    await page.waitForTimeout(800)
    const state = await snapshot(page, side, scenario)
    const box = await page.evaluate((sels) => {
      const rects = sels
        .flatMap((s) => [...document.querySelectorAll(s)])
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
      if (!rects.length) return null
      const x = Math.min(...rects.map((r) => r.left)) + window.scrollX
      const y = Math.min(...rects.map((r) => r.top)) + window.scrollY
      const right = Math.max(...rects.map((r) => r.right)) + window.scrollX
      const bottom = Math.max(...rects.map((r) => r.bottom)) + window.scrollY
      return {
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: right - Math.max(0, x),
        height: bottom - Math.max(0, y),
      }
    }, scenario.clip ?? [])
    const shot =
      scenario.clip?.length && box
        ? await page.screenshot({ clip: box, fullPage: true, animations: 'disabled' })
        : await page.screenshot({ fullPage: !!scenario.fullPage, animations: 'disabled' })
    const paint = scenario.paintFrom
      ? await page.evaluate(
          ([sel, origin]) =>
            [...document.querySelectorAll(sel)].map((el) => {
              const r = el.getBoundingClientRect()
              return {
                x: r.left + window.scrollX - origin.x,
                y: r.top + window.scrollY - origin.y,
                width: r.width,
                height: r.height,
              }
            }),
          [scenario.paintFrom, box ?? { x: 0, y: 0 }]
        )
      : []
    return { state, png: PNG.sync.read(shot), paint }
  } finally {
    await context.close()
  }
}

async function main() {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`)
    const value = i >= 0 ? process.argv[i + 1] : undefined
    return value && !value.startsWith('--') ? value : undefined
  }
  const a = arg('a') ?? 'live'
  const b = arg('b')
  const out = arg('out')
  if (!b || !out) {
    console.error(
      'usage: compare-live-states.mjs --b <export origin> --out <dir> [--a live|<origin>] [--only <text>]'
    )
    process.exit(2)
  }
  mkdirSync(out, { recursive: true })
  const { SCENARIOS } = await import('./live-state-scenarios.mjs')
  const only = arg('only')
  const runs = expandScenarios(SCENARIOS).filter((s) => !only || s.id.includes(only))
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const report = []
  for (const scenario of runs) {
    try {
      const left = await run(browser, scenario, a)
      const right = await run(browser, scenario, b)
      const rects = [...left.paint, ...right.paint]
      const { ratio } = await diffRatio(paintRects(left.png, rects), paintRects(right.png, rects))
      const diffs = stateDiff(left.state, right.state)
      const result = { id: scenario.id, ratio: Number(ratio.toFixed(4)), diffs }
      result.verdict = verdict(result, scenario.maxDiff)
      report.push(result)
      writeFileSync(
        join(out, `${scenario.id}.side.png`),
        PNG.sync.write(sideBySide(left.png, right.png))
      )
      console.log(`${result.verdict.padEnd(14)} ${result.id}  diff ${(ratio * 100).toFixed(2)}%`)
      for (const d of diffs)
        console.log(`    ${d.key}: ${JSON.stringify(d.a)} | ${JSON.stringify(d.b)}`)
    } catch (err) {
      report.push({ id: scenario.id, verdict: 'error', error: String(err).slice(0, 200) })
      console.log(`error          ${scenario.id}  ${String(err).slice(0, 120)}`)
    }
  }
  await browser.close()
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const failed = report.filter((r) => r.verdict !== 'ok')
  console.log(`${report.length - failed.length}/${report.length} ok; report in ${out}.`)
  process.exit(failed.length ? 1 : 0)
}

if (process.argv[1] && process.argv[1].endsWith('compare-live-states.mjs')) main()
