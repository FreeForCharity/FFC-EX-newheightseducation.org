import { test, expect } from '@playwright/test'

/**
 * The first screen a phone visitor sees must not be blank.
 *
 * This exists because every other check we had passed while the deployed home
 * page showed a green header and then nothing. `verify:build` counted 438
 * pages with one `<h1>` and a canonical each. Lighthouse scored accessibility
 * 100 and SEO 100. The post-deploy smoke's twelve specs were green. A
 * 438-route Chromium audit reported 0 non-OK responses, 0 broken images, 0
 * same-origin failures and 0 "thin" pages. None of them was wrong, and none of
 * them was looking at the question a visitor asks first.
 *
 * What they all measured was TOTALS -- does the page have a heading, does it
 * have text, do its assets load. The home page had 4,806 characters of text
 * and 16 visible images. Its first heading was at y=1005, a full screen below
 * the fold on a 844px phone, and the 915px above it held one 128px image.
 *
 * The cause was `vc_row-o-full-height` (`min-height: 100vh`, WPBakery's
 * "full height row" option, the source site's own CSS). At 1280px the
 * section's cover image renders 1280x400 and the navigation sits above it, so
 * the fold is full. At 390px the image drops to its 414x129 srcset variant and
 * the navigation collapses into the hamburger, so the same section is a blank
 * screen. Capped at the phone breakpoint in `globals.css`.
 *
 * Phone only, deliberately: the desktop layout was correct throughout that
 * defect, and running both viewports would have found nothing extra while
 * doubling the suite's slowest specs.
 */

/**
 * The front page, a template page, and the three captured pages that carry
 * `vc_row-o-full-height`. The last three are canaries rather than coverage:
 * they are the pages where the source markup can reintroduce a full-height
 * hero, so if the cap ever stops applying they fail here first.
 */
const SAMPLE = [
  '',
  'privacy-policy/',
  'events/school-bag-give-away/',
  'support-nheg/giving-tuesday-november-27-2018/',
  'nheg-educational-programs/virtual-reading-program/',
]

const PHONE = { width: 390, height: 844 }

/**
 * Largest empty band is capped at 40% of the viewport, and the first readable
 * text must land inside the first screen.
 *
 * Measured on the deployed export at 390x844 after the fix, across these five
 * pages: first text between y=90 and y=247, largest band between 45px and
 * 93px (5-11%). Before it, the home page measured first text at y=1005 with a
 * 376px band (41% of a 915px viewport). Both thresholds therefore sit well
 * clear of the healthy range and well inside the broken one -- the point is to
 * catch a blank screen, not to police whitespace.
 */
const MAX_EMPTY_BAND_RATIO = 0.4

type FoldMetrics = {
  viewportHeight: number
  firstTextY: number
  largestBand: number
}

test.describe('above the fold', () => {
  test.setTimeout(5 * 60 * 1000)

  test('a phone visitor sees content on the first screen', async ({ page }) => {
    await page.setViewportSize(PHONE)
    const failures: string[] = []

    for (const path of SAMPLE) {
      const response = await page.goto(`./${path}`, { waitUntil: 'load' })
      // A route this suite does not own is not this test's failure; `routes`
      // already asserts every advertised route resolves.
      if (response && response.status() >= 400) continue
      await page.waitForTimeout(600)

      const m: FoldMetrics = await page.evaluate(() => {
        const vh = window.innerHeight

        /**
         * `position: fixed` subtrees are excluded, and that exclusion is the
         * whole reason this test can see anything.
         *
         * FFC's cookie banner is `fixed bottom-0` and covers the bottom ~350px
         * of a phone viewport on a first visit -- 41% of the screen. Counted as
         * content it fills exactly the band a blank hero leaves empty, and the
         * home page would have scored as healthy while showing nothing. A
         * consent dialog is also not what the visitor came to read.
         */
        const isFixed = (el: Element) => {
          for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
            if (getComputedStyle(n).position === 'fixed') return true
          }
          return false
        }

        const isVisible = (el: Element) => {
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return (
            r.width > 2 &&
            r.height > 2 &&
            s.display !== 'none' &&
            s.visibility !== 'hidden' &&
            Number(s.opacity) > 0.05
          )
        }

        const TEXT = 'h1,h2,h3,h4,p,li,td,figcaption,blockquote'
        const INK = `${TEXT},img,svg,video,button,input`

        const texts = Array.from(document.querySelectorAll(TEXT)).filter(
          (e) =>
            isVisible(e) && !isFixed(e) && ((e as HTMLElement).innerText || '').trim().length > 3
        )
        const firstTextY = texts.length
          ? Math.round(
              Math.min(...texts.map((e) => e.getBoundingClientRect().top + window.scrollY))
            )
          : -1

        // Vertical extent of everything a visitor can actually see, clipped to
        // the first screen, then merged so overlapping boxes count once.
        const spans: Array<[number, number]> = []
        for (const el of Array.from(document.querySelectorAll(INK))) {
          if (!isVisible(el) || isFixed(el)) continue
          const isMedia = /^(IMG|SVG|VIDEO|BUTTON|INPUT)$/.test(el.tagName)
          if (!isMedia && ((el as HTMLElement).innerText || '').trim().length < 3) continue
          const r = el.getBoundingClientRect()
          const top = Math.max(0, r.top)
          const bottom = Math.min(vh, r.bottom)
          if (bottom > top) spans.push([top, bottom])
        }
        spans.sort((a, b) => a[0] - b[0])

        const merged: Array<[number, number]> = []
        let current: [number, number] | null = null
        for (const [start, end] of spans) {
          if (!current) current = [start, end]
          else if (start <= current[1]) current[1] = Math.max(current[1], end)
          else {
            merged.push(current)
            current = [start, end]
          }
        }
        if (current) merged.push(current)

        let largestBand = 0
        let cursor = 0
        for (const [start, end] of merged) {
          largestBand = Math.max(largestBand, start - cursor)
          cursor = end
        }
        largestBand = Math.max(largestBand, vh - cursor)

        return { viewportHeight: vh, firstTextY, largestBand: Math.round(largestBand) }
      })

      const label = path || '(home)'

      if (m.firstTextY < 0 || m.firstTextY >= m.viewportHeight) {
        failures.push(
          `${label}: no readable text on the first screen — first text at y=${m.firstTextY} of a ${m.viewportHeight}px viewport`
        )
      }

      const cap = Math.round(m.viewportHeight * MAX_EMPTY_BAND_RATIO)
      if (m.largestBand > cap) {
        failures.push(
          `${label}: ${m.largestBand}px of the first screen is empty (cap ${cap}px, ${Math.round(
            (m.largestBand / m.viewportHeight) * 100
          )}% of the viewport)`
        )
      }
    }

    expect(failures, `blank above the fold on a phone:\n${failures.join('\n')}`).toEqual([])
  })
})
