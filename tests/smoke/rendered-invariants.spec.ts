import { test, expect } from '@playwright/test'
import { smokeBase, resolveLoc, parseLocs, pool } from './_helpers'

/**
 * Invariants that only a BROWSER against the real deployment can check.
 *
 * Each one here exists because a static check passed while the rendered page
 * was wrong. They are not duplicates of `verify:build` or the local E2E suite;
 * they are the cases those two are structurally unable to see.
 */

/** A spread of real pages: the front page, a captured leaf, and a template page. */
const SAMPLE = ['', 'cart/', 'privacy-policy/']

test.describe('rendered invariants', () => {
  test.setTimeout(5 * 60 * 1000)

  /**
   * `verify:build` counts `<h1>` TAGS in the exported HTML. axe reads the
   * accessibility tree. Those disagree whenever the captured theme hides the
   * heading: on this site `/cart`'s only `<h1>` is `display: none`, so the
   * build check passed, `ensureSingleH1` saw a heading and skipped the page,
   * and a screen-reader user still arrives somewhere with no heading at all.
   *
   * A fragment cannot know its own computed CSS, so no amount of static
   * analysis closes this -- it needs a rendered page, which is what this is.
   */
  test('every sampled page has a heading a screen reader can reach', async ({ page }) => {
    const missing: string[] = []
    for (const path of SAMPLE) {
      await page.goto(`./${path}`)
      const perceivable = await page.evaluate(() =>
        Array.from(document.querySelectorAll('h1')).some((h) => {
          if (h.closest('[aria-hidden="true"]')) return false
          for (let n: HTMLElement | null = h; n; n = n.parentElement) {
            const cs = getComputedStyle(n)
            if (cs.display === 'none' || cs.visibility === 'hidden') return false
          }
          return (h.textContent || '').trim().length > 0
        })
      )
      if (!perceivable) missing.push(path || '(home)')
    }
    expect(
      missing.length,
      `pages whose <h1> exists in the HTML but not in the accessibility tree: ${missing.join(', ')}`
    ).toBe(0)
  })

  /**
   * The captured WordPress share bar was stripped of its JavaScript but kept
   * its markup: links pointing at `href="#"` with the real destination parked
   * in `data-ss-ss-link`, and icon-only triggers with no accessible name. The
   * repair runs in the conversion pipeline, so this asserts the SHIPPED result
   * rather than the pipeline's own unit tests.
   */
  test('no dead social-share chrome survives on the deployed pages', async ({ page }) => {
    const found: string[] = []
    for (const path of SAMPLE) {
      await page.goto(`./${path}`)
      const counts = await page.evaluate(() => ({
        parked: document.querySelectorAll('a[href="#"][data-ss-ss-link]').length,
        shareAll: document.querySelectorAll('.ss-share-all').length,
        overlay: document.querySelectorAll('.ss-popup-overlay').length,
      }))
      for (const [k, v] of Object.entries(counts)) {
        if (v > 0) found.push(`${path || '(home)'}: ${k}=${v}`)
      }
    }
    expect(found.length, `dead share chrome still published: ${found.join('; ')}`).toBe(0)
  })

  /**
   * The site's OWN navigation must be the one a visitor can see.
   *
   * This is the test that would have caught two days of a migration looking
   * nothing like the site it migrated, and it has to live here because every
   * fact in it is a rendered fact. Both halves were measured on
   * newheightseducation.org, 2026-09-24, before the fix:
   *
   *   - FFC's header is `position: fixed`, 80px tall, `z-index: 50`, and
   *     `.ffc-clone { isolation: isolate }` above deliberately keeps the
   *     capture beneath FFC's chrome. So the captured header at 0..60px was
   *     painted over on all 793 pages -- the eight links `Learning Annex,
   *     Home, Who We Are, Programs, Volunteer, Events, Support NHEG, Radio
   *     Show` present, sized, and invisible.
   *   - What showed instead offered `/#hero`, `/#mission`, `/#programs`,
   *     `/#volunteer`, `/#donate`, `/#faq`, `/#team`: seven anchors into a
   *     template home page that captured content had replaced. Zero of those
   *     ids exist in the built home page.
   *
   * Every gate in this repo verifies the export against ITSELF, which is why
   * a nav that was both hidden and dead passed all of them. A DOM query alone
   * would not have caught it either -- the links were in the DOM. Only the
   * geometry says what a visitor sees.
   */
  test("the captured page's own header is the visible one", async ({ page }) => {
    for (const path of SAMPLE) {
      await page.goto(`./${path}`, { waitUntil: 'load' })

      const m = await page.evaluate(() => {
        const clone = document.querySelector('.ffc-clone')
        const capturedHeader = clone?.querySelector('header') ?? null
        const templateHeader = document.querySelector('body > header')
        if (!clone || !capturedHeader) return { skip: true as const }
        const templateVisible =
          !!templateHeader && getComputedStyle(templateHeader).display !== 'none'
        const hb = capturedHeader.getBoundingClientRect()
        // Anything of FFC's still painting over the captured header's band.
        const band = { x: Math.round(hb.x + hb.width / 2), y: Math.round(hb.y + hb.height / 2) }
        const topAt = document.elementFromPoint(band.x, band.y) as HTMLElement | null
        return {
          skip: false as const,
          templateVisible,
          capturedHeaderHeight: Math.round(hb.height),
          topIsCaptured: !!topAt?.closest('.ffc-clone'),
        }
      })

      // A capture that brings no header of its own keeps FFC's, by design.
      if (m.skip) continue

      expect(
        m.templateVisible,
        `${path || '(home)'}: the template header must not render over the page's own`
      ).toBe(false)
      expect(
        m.capturedHeaderHeight,
        `${path || '(home)'}: the captured header must occupy real space`
      ).toBeGreaterThan(0)
      expect(
        m.topIsCaptured,
        `${path || '(home)'}: the topmost element in the captured header's band must be the capture's`
      ).toBe(true)
    }
  })

  /**
   * A phone must be able to navigate the site.
   *
   * At 390px the captured header collapses to a hamburger and the desktop menu
   * is `display: none`, so that control IS the navigation. Measured before it
   * was wired: two hamburger elements present on /who-we-are/ and
   * /contact-us/, ZERO visible navigation links, and tapping either changed
   * nothing. Every page, every phone visitor.
   *
   * Two separate causes, and the first hid the second. `clone-enhance` -- the
   * captured pages' whole client runtime, which workflow 706 generates -- was
   * imported by nothing. Wiring it up changed nothing either, because it was
   * written for a Divi capture and this site is Jupiter/MK, so none of its
   * selectors matched. A test that only asserted "the component renders" would
   * have passed through both.
   *
   * So this asserts the OUTCOME a visitor cares about: tap the control, more
   * navigation becomes visible than before.
   */
  test('a phone can open the site navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of SAMPLE) {
      await page.goto(`./${path}`, { waitUntil: 'load' })

      const toggle = page
        .locator('.ffc-clone')
        .locator('.mk-nav-responsive-link, .mobile_menu_bar, .et_mobile_nav_menu')
        .first()
      // A capture whose header does not collapse has nothing to assert here.
      if ((await toggle.count()) === 0 || !(await toggle.isVisible())) continue

      const countVisibleNavLinks = () =>
        page.evaluate(
          () =>
            [
              ...document.querySelectorAll(
                '.ffc-clone .mk-responsive-wrap a, .ffc-clone .mobile_nav a, .ffc-clone header a'
              ),
            ].filter((a) => a.getBoundingClientRect().width > 0).length
        )

      const before = await countVisibleNavLinks()
      await toggle.click()
      await page.waitForTimeout(500)
      const after = await countVisibleNavLinks()

      expect(
        after,
        `${path || '(home)'}: tapping the menu control must reveal navigation (${before} -> ${after})`
      ).toBeGreaterThan(before)

      // The control was a bare <div>/<span> in the capture; it must reach the
      // accessibility tree as something operable, not just work with a mouse.
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(toggle).toHaveAttribute('role', 'button')
    }
  })

  /**
   * Captured chrome cannot paint above FFC's own overlays.
   *
   * Social Snap ships `#ss-floating-bar { position: fixed; z-index: 999 }` and
   * the captured Astra header is fixed too, both chosen to beat any theme.
   * FFC's cookie-consent modal is `z-50`, so before
   * `.ffc-clone { isolation: isolate }` the capture painted on top of it and
   * SWALLOWED the click that dismisses it -- a GDPR control a visitor could
   * not use. A unit test cannot see a pointer event, which is why this lives
   * here.
   *
   * The first version of this test hit-tested the viewport CORNERS and was
   * flaky: `#ss-floating-bar` is a LEFT SIDEBAR, so it legitimately owns the
   * top-left corner, and being topmost where no overlay exists is not the
   * defect. It failed, passed on retry, and was measuring the wrong property
   * in both directions. What follows asserts the guarantee itself.
   */
  test('captured chrome cannot paint above FFC overlays', async ({ page }) => {
    await page.goto('./', { waitUntil: 'load' })

    // 1. The structural guarantee, and it is deterministic: an element that
    //    isolates creates a stacking context, so NO descendant z-index -- 999
    //    or otherwise -- can be compared against anything outside it.
    const isolation = await page.evaluate(() => {
      const clone = document.querySelector('.ffc-clone')
      return clone ? getComputedStyle(clone).isolation : 'no .ffc-clone on the page'
    })
    expect(isolation, '.ffc-clone must create its own stacking context').toBe('isolate')

    // 2. ...and the consequence, measured where it actually bit: with FFC's
    //    consent dialog open, a point inside the dialog must hit the DIALOG.
    //    The dialog is behind the banner's "Customize" button -- an earlier
    //    version looked for `[role="dialog"]` on plain load, found none, and
    //    called `test.skip()`, which marks the WHOLE test skipped and throws
    //    away the isolation assertion above along with it. A test that reports
    //    "skipped" on every healthy deployment is indistinguishable from one
    //    that is broken.
    const customize = page.getByRole('button', { name: /customi[sz]e/i })
    await customize.waitFor({ state: 'visible', timeout: 20_000 })
    await customize.click()

    const dialog = page.locator('[role="dialog"][aria-modal="true"]')
    await dialog.waitFor({ state: 'visible', timeout: 20_000 })
    const box = await dialog.boundingBox()
    expect(box, 'consent dialog must have a box to hit-test').not.toBeNull()

    // The overlay sits behind the dialog panel and fills the viewport; a point
    // just inside its top-left is where captured fixed chrome used to win.
    const hit = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null
        if (!el) return 'nothing'
        return el.closest('.ffc-clone')
          ? `captured: ${el.tagName}#${el.id || ''}.${el.className}`.slice(0, 140)
          : 'ffc'
      },
      [Math.round(box!.x + 4), Math.round(box!.y + 4)] as const
    )
    expect(hit, 'a point inside the FFC consent dialog must not hit captured markup').toBe('ffc')
  })

  /**
   * The page must load without an error THIS DEPLOYMENT is responsible for.
   *
   * Scoped deliberately, because the obvious version of this test is useless:
   * a blanket "no console errors" flags a third-party CDN being slow, an ad
   * blocker, and every `net::ERR_ABORTED` from Next's own link prefetching --
   * none of which say anything about the deploy, and all of which make the
   * check the first thing someone disables. What IS ours:
   *
   *   - a Content-Security-Policy violation. The CSP ships in this site's own
   *     <meta>, so a refusal means the page references something the site
   *     forbids itself -- which it will do on every visitor's browser. This
   *     found 251 pages carrying a `fonts.googleapis.com` stylesheet that
   *     `style-src 'self'` refuses, left behind because the capture localized
   *     the CSS `@import` form of that font and not the `<link>` form.
   *   - a failed request for a SAME-ORIGIN asset, which means we published a
   *     reference to something we did not publish.
   */
  test('the home page loads without a failure this deployment owns', async ({ page }) => {
    const base = new URL(smokeBase())
    const ours: string[] = []
    page.on('console', (m) => {
      const text = m.text()
      if (m.type() === 'error' && /Content Security Policy/i.test(text)) {
        ours.push(`CSP: ${text.slice(0, 220)}`)
      }
    })
    page.on('requestfailed', (r) => {
      const url = r.url()
      const err = r.failure()?.errorText ?? ''
      // Prefetch and navigation cancellations are routine, not failures.
      if (err.includes('ERR_ABORTED')) return
      // A third party being unreachable is not this deploy's defect -- and in
      // a sandboxed runner it is usually the egress proxy, not the internet.
      if (new URL(url).origin !== base.origin) return
      ours.push(`same-origin request failed: ${url.slice(0, 200)} (${err})`)
    })
    await page.goto('./', { waitUntil: 'load' })
    await page.waitForTimeout(1500)
    expect(ours.length, `failures this deployment owns:\n${ours.join('\n')}`).toBe(0)
  })
})

/**
 * A route the sitemap advertises must be the page it claims, not a soft 404.
 *
 * GitHub Pages serves `404.html` with a 404 STATUS, so the route check above
 * catches a missing page. This catches the other shape: a host or exporter
 * that answers 200 with the wrong document.
 */
test('a sample of advertised routes serve distinct documents', async ({ request }) => {
  const base = smokeBase()
  const res = await request.get(new URL('sitemap.xml', base).toString(), { maxRedirects: 5 })
  expect(res.status()).toBe(200)
  const locs = parseLocs(await res.text())
  expect(locs.length).toBeGreaterThan(3)

  // Evenly spaced rather than the first N, which on a sitemap ordered by path
  // would all come from one section.
  const step = Math.max(1, Math.floor(locs.length / 12))
  const sample = locs.filter((_, i) => i % step === 0).slice(0, 12)

  const titles = await pool(sample, 6, async (loc) => {
    const r = await request.get(resolveLoc(loc, base), { maxRedirects: 5 })
    const html = await r.text()
    return /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  })

  const distinct = new Set(titles.filter(Boolean))
  // If a host rewrote everything to one document, every title would match --
  // which is exactly the defect that made the LOCAL suite test the home page
  // for every route until it was fixed. Same shape, different layer.
  expect(
    distinct.size,
    `${sample.length} sampled routes produced only ${distinct.size} distinct title(s): ${[...distinct].join(' | ')}`
  ).toBeGreaterThan(1)
})
