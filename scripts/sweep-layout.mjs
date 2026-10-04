#!/usr/bin/env node
/**
 * The #63 own-merits sweep: loads every built route at three viewports and
 * records what a visitor would notice. Horizontal overflow (with the widest
 * offenders), images that failed or render at zero size, failed stylesheets
 * and scripts, console errors and CSP violations, grouped by issue.
 *
 *   node scripts/sweep-layout.mjs --export http://localhost:3000 --out <file> [--routes a,b]
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const VIEWPORTS = { desktop: 1440, tablet: 768, mobile: 390 }

/** Routes of a built export: every directory holding an index.html. */
export function routesOf(outDir) {
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('_') && e.name !== 'pagefind')
        walk(join(dir, e.name))
      else if (e.name === 'index.html') out.push(`/${relative(outDir, dir)}/`.replace(/\/+/g, '/'))
    }
  }
  walk(outDir)
  return out.sort()
}

/** Findings grouped as issue -> routes, for reading. */
export function groupFindings(results) {
  const groups = {}
  for (const { route, viewport, issues } of results) {
    for (const issue of issues) (groups[issue] ??= []).push(`${route} @${viewport}`)
  }
  return Object.fromEntries(Object.entries(groups).sort((a, b) => b[1].length - a[1].length))
}

async function check(page, origin, route, width) {
  const issues = []
  const onConsole = (m) => {
    if (m.type() === 'error') issues.push(`console: ${m.text().slice(0, 120)}`)
  }
  const onResponse = (r) => {
    const type = r.request().resourceType()
    if (r.status() >= 400 && ['stylesheet', 'script', 'image', 'font'].includes(type)) {
      issues.push(`${type} ${r.status()}: ${new URL(r.url()).pathname.slice(0, 120)}`)
    }
  }
  const onFailed = (r) => {
    const type = r.resourceType()
    const error = r.failure()?.errorText ?? ''
    if (
      ['stylesheet', 'script', 'image', 'font'].includes(type) &&
      !error.includes('ERR_ABORTED')
    ) {
      issues.push(`${type} failed (${error}): ${r.url().slice(0, 120)}`)
    }
  }
  page.on('console', onConsole)
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)
  try {
    await page.setViewportSize({ width, height: 900 })
    const res = await page.goto(origin + route, { waitUntil: 'load', timeout: 60000 })
    if (!res || !res.ok()) throw new Error(`HTTP ${res?.status()}`)
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(300)
    issues.push(
      ...(await page.evaluate(() => {
        const found = []
        const vw = document.documentElement.clientWidth
        if (document.documentElement.scrollWidth > vw + 1) {
          const wide = [...document.querySelectorAll('body *')]
            .filter(
              (e) =>
                e.getBoundingClientRect().right > vw + 1 && getComputedStyle(e).position !== 'fixed'
            )
            .filter((e) => ![...e.children].some((c) => c.getBoundingClientRect().right > vw + 1))
            .slice(0, 3)
            .map(
              (e) =>
                `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.') : ''}`
            )
          found.push(`overflow: ${wide.join(', ')}`)
        }
        for (const img of document.images) {
          if (!img.src || (img.loading === 'lazy' && !img.complete)) continue
          const hidden =
            img.closest('[hidden], [aria-hidden="true"]') ||
            getComputedStyle(img).display === 'none'
          if (hidden) continue
          const name = new URL(img.src).pathname.slice(-80)
          if (img.complete && img.naturalWidth === 0) found.push(`broken image: ${name}`)
          else if (img.complete && img.offsetParent !== null) {
            const r = img.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) found.push(`zero-size image: ${name}`)
          }
        }
        for (const v of window.__cspViolations ?? []) found.push(`csp: ${v}`)
        return found
      }))
    )
  } catch (err) {
    issues.push(`load failed: ${String(err).split('\n')[0].slice(0, 100)}`)
  }
  page.off('console', onConsole)
  page.off('response', onResponse)
  page.off('requestfailed', onFailed)
  return [...new Set(issues)]
}

async function main() {
  const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`)
    const value = i >= 0 ? process.argv[i + 1] : undefined
    return value && !value.startsWith('--') ? value : undefined
  }
  const origin = arg('export')?.replace(/\/$/, '')
  const outFile = arg('out')
  const outDir = arg('dir') ?? 'out'
  if (!origin || !outFile) {
    console.error(
      'usage: sweep-layout.mjs --export <origin> --out <file> [--dir out] [--routes a,b]'
    )
    process.exit(2)
  }
  const explicit = (arg('routes') ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => `/${r}/`.replace(/\/+/g, '/'))
  const routes = explicit.length ? explicit : routesOf(outDir)
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const queue = routes.flatMap((route) => Object.entries(VIEWPORTS).map(([v, w]) => [route, v, w]))
  const results = []
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      const context = await browser.newContext()
      await context.addInitScript(() => {
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
        )
        window.__cspViolations = []
        document.addEventListener('securitypolicyviolation', (e) =>
          window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`.slice(0, 120))
        )
      })
      const page = await context.newPage()
      for (let job = queue.shift(); job; job = queue.shift()) {
        const [route, viewport, width] = job
        results.push({ route, viewport, issues: await check(page, origin, route, width) })
      }
      await context.close()
    })
  )
  await browser.close()
  const grouped = groupFindings(results)
  writeFileSync(outFile, JSON.stringify({ checked: results.length, grouped }, null, 2) + '\n')
  console.log(
    `Checked ${results.length} page views; ${Object.keys(grouped).length} distinct issues.`
  )
}

if (process.argv[1] && process.argv[1].endsWith('sweep-layout.mjs')) main()
