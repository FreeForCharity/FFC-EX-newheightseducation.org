#!/usr/bin/env node
/**
 * The #106 motion sweep: loads every built route at desktop and phone width,
 * scrolls it through, and records content a visitor cannot see (text or
 * images left at opacity 0, hidden, or clipped inside a collapsed box) and
 * theme behaviour that does not respond (parallax, content fade, sticky
 * header, back-to-top), grouped by issue.
 *
 *   node scripts/sweep-motion.mjs --export http://localhost:3000 --out <file> [--routes a,b]
 */
import { writeFileSync } from 'node:fs'
import { routesOf, groupFindings } from './sweep-layout.mjs'

export const VIEWPORTS = { desktop: 1440, mobile: 390 }

/** Closed-by-design containers: menus, overlays, dialogs and collapsed panels. */
export const CLOSED = [
  '[hidden]',
  '[aria-hidden="true"]',
  'dialog:not([open])',
  'header',
  'nav',
  '.sub-menu',
  '.mk-responsive-wrap',
  '.mk-fullscreen-search-overlay',
  '.mk-box-to-trigger',
  '.vc_toggle_content',
  '.woocommerce-Tabs-panel',
  '.ffc-lightbox',
  '.product-hover-image',
  '.pagenav-bottom',
  '.image-hover-overlay',
].join(', ')

function inspect(closed) {
  const found = []
  const label = (el) =>
    `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`
  const why = (el) => {
    for (let e = el; e && !e.classList?.contains('ffc-clone'); e = e.parentElement) {
      const s = getComputedStyle(e)
      if (s.opacity === '0') return `opacity 0 on ${label(e)}`
      if (s.visibility === 'hidden') return `visibility hidden on ${label(e)}`
      const r = e.getBoundingClientRect()
      if (
        e !== el &&
        s.overflow !== 'visible' &&
        r.height < 20 &&
        el.getBoundingClientRect().height > 50
      )
        return `clipped by ${label(e)} (${Math.round(r.height)}px)`
    }
    return null
  }
  const clone = document.querySelector('.ffc-clone')
  if (!clone) return found
  const candidates = [...clone.querySelectorAll('*')].filter((el) => {
    if (el.closest(closed)) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return false
    if (el.tagName === 'IMG') return r.width > 40 && r.height > 40
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 20)
  })
  for (const el of candidates) {
    const reason = why(el)
    if (reason) found.push(`hidden content: ${reason}`)
  }
  const shown = (img) => {
    const r = img.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  for (const el of clone.querySelectorAll('*')) {
    if (el.closest(closed) || !el.querySelector('img')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 100 || r.height >= 20) continue
    if (getComputedStyle(el).display === 'none' || [...el.querySelectorAll('img')].some(shown))
      continue
    const parent = el.parentElement.getBoundingClientRect()
    if (parent.height < 20 && parent.width >= 100) continue
    found.push(
      `hidden content: collapsed ${label(el)} (${Math.round(r.height)}px, images not shown)`
    )
  }
  return [...new Set(found)]
}

async function check(page, origin, route, width) {
  const issues = []
  try {
    await page.setViewportSize({ width, height: 900 })
    const res = await page.goto(origin + route, { waitUntil: 'load', timeout: 60000 })
    if (!res || !res.ok()) throw new Error(`HTTP ${res?.status()}`)
    await page
      .waitForFunction(() => document.documentElement.hasAttribute('data-ffc-motion-ready'), null, {
        timeout: 5000,
      })
      .catch(() => {})
    const at = (y) =>
      page.evaluate(async (top) => {
        window.scrollTo({ top, behavior: 'instant' })
        await new Promise((r) => setTimeout(r, 120))
        const inner = document.querySelector('.vc_parallax-inner')
        const grid = document.querySelector('.vc_parallax-content-moving-fade .mk-grid')
        const header = document.querySelector('header.mk-header[data-sticky-style="fixed"]')
        const holder = header?.querySelector('.mk-header-holder')
        return {
          parallax: inner ? getComputedStyle(inner).transform : null,
          fade: grid ? getComputedStyle(grid).opacity : null,
          sticky: header ? header.classList.contains('a-sticky') : null,
          fixed: holder ? getComputedStyle(holder).position === 'fixed' : false,
          goTop: document.querySelector('.mk-go-top')?.classList.contains('is-active') ?? null,
          astTop: (() => {
            const a = document.querySelector('#ast-scroll-top')
            return a ? getComputedStyle(a).display !== 'none' : null
          })(),
          height: document.documentElement.scrollHeight,
          sidebar: (() => {
            const s = document.querySelector(
              '.ffc-clone.ast-sticky-sidebar #secondary .sidebar-main'
            )
            if (!s || window.innerWidth < 922) return null
            const room = s.parentElement.getBoundingClientRect().bottom - 50 - s.offsetHeight
            return { top: s.getBoundingClientRect().top, room }
          })(),
        }
      }, y)
    const top = await at(0)
    const mid = await at(700)
    const hasParallax = await page.evaluate(
      () => !!document.querySelector('[data-vc-parallax][data-vc-parallax-image]')
    )
    if (hasParallax && !top.parallax) issues.push('parallax: no layer')
    else if (hasParallax && top.parallax === mid.parallax)
      issues.push('parallax: layer does not move')
    if (top.fade !== null) {
      const faded = await page.evaluate(async () => {
        const grid = document.querySelector('.vc_parallax-content-moving-fade .mk-grid')
        const bottom = grid.getBoundingClientRect().bottom + window.scrollY
        window.scrollTo({ top: bottom, behavior: 'instant' })
        await new Promise((r) => setTimeout(r, 120))
        return Number(getComputedStyle(grid).opacity)
      })
      if (Number(top.fade) < 0.95 || faded > 0.05)
        issues.push('fade: content opacity does not follow scroll')
    }
    if (top.sticky !== null && top.fixed && (top.sticky || !mid.sticky))
      issues.push('sticky header: a-sticky does not follow scroll')
    if (top.goTop !== null && top.height > 1400 && (top.goTop || !mid.goTop))
      issues.push('back-to-top (Jupiter): does not appear')
    if (top.astTop !== null && top.height > 1300 && (top.astTop || !mid.astTop))
      issues.push('back-to-top (Astra): does not appear')
    if (mid.sidebar && mid.sidebar.room > 2 && Math.abs(mid.sidebar.top - 50) > 2)
      issues.push('sticky sidebar: does not stick')
    issues.push(
      ...(await page.evaluate(() => {
        const found = []
        const trigger = document.querySelector('.ffc-clone .mk-toggle-trigger')
        if (trigger) {
          trigger.click()
          const box = document.getElementById(trigger.getAttribute('aria-controls') ?? '')
          if (!box || getComputedStyle(box).display === 'none')
            found.push('share box: does not open')
          trigger.click()
        }
        const link = document.querySelector('.ffc-clone a.mk-lightbox')
        if (link) {
          link.click()
          const dialog = document.querySelector('dialog.ffc-lightbox')
          if (!dialog?.open) found.push('lightbox: does not open')
          dialog?.close()
        }
        const tabs = document.querySelector('.ffc-clone .woocommerce-tabs')
        if (tabs) {
          const shown = [...tabs.querySelectorAll('.woocommerce-Tabs-panel')].filter(
            (panel) => getComputedStyle(panel).display !== 'none'
          )
          if (shown.length !== 1) found.push(`product tabs: ${shown.length} panels shown`)
          const other = tabs.querySelector('a[role="tab"][aria-selected="false"]')
          if (other) {
            other.click()
            const panel = document.getElementById(other.getAttribute('aria-controls') ?? '')
            if (!panel || getComputedStyle(panel).display === 'none')
              found.push('product tabs: a tab does not switch')
          }
        }
        const thumbs = document.querySelectorAll('.ffc-clone .ffc-gallery-thumb')
        if (thumbs.length > 1) {
          thumbs[1].click()
          const slide = document.querySelectorAll('.woocommerce-product-gallery__image')[1]
          if (!slide || getComputedStyle(slide).display === 'none')
            found.push('product gallery: a thumbnail does not switch the photo')
        }
        const title = document.querySelector('.ffc-clone .vc_toggle_title')
        if (title) {
          const control = title.querySelector('button') ?? title
          control.click()
          const content = title.parentElement.querySelector('.vc_toggle_content')
          if (getComputedStyle(content).display === 'none') found.push('vc_toggle: does not open')
          control.click()
        }
        return found
      }))
    )
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo({ top: y, behavior: 'instant' })
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
    await page.waitForTimeout(800)
    issues.push(...(await page.evaluate(inspect, CLOSED)))
  } catch (err) {
    issues.push(`load failed: ${String(err).split('\n')[0].slice(0, 100)}`)
  }
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
  if (!origin || !outFile) {
    console.error(
      'usage: sweep-motion.mjs --export <origin> --out <file> [--dir out] [--routes a,b]'
    )
    process.exit(2)
  }
  const explicit = (arg('routes') ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => `/${r}/`.replace(/\/+/g, '/'))
  const routes = explicit.length ? explicit : routesOf(arg('dir') ?? 'out')
  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch()
  const queue = routes.flatMap((route) => Object.entries(VIEWPORTS).map(([v, w]) => [route, v, w]))
  const results = []
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      const context = await browser.newContext()
      await context.addInitScript(() =>
        localStorage.setItem(
          'cookie-consent',
          JSON.stringify({ necessary: true, functional: true, analytics: false, marketing: false })
        )
      )
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

if (process.argv[1] && process.argv[1].endsWith('sweep-motion.mjs')) main()
