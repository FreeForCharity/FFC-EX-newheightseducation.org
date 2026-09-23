import { test, expect } from '@playwright/test'
import { smokeBase } from './_helpers'
import { siteConfig } from '../../src/lib/site.config'

/**
 * The deployment serves THIS charity's site, wired to the URL it is served at.
 *
 * A deploy can succeed while publishing the wrong thing: the FFC template's own
 * placeholder content when a rebrand did not take, or the charity's content
 * with canonical and asset URLs still pointing at a host it is not on. Both
 * render fine and both are wrong, so neither shows up as a failed build.
 */
test('the home page is the charity site, not the FFC template default', async ({ page }) => {
  await page.goto('./')
  const title = await page.title()
  expect(title.length, 'home page must have a title').toBeGreaterThan(0)
  // The template's distinctive title is what a failed rebrand leaves behind.
  expect(title).not.toMatch(/Free For Charity\s*[|–-]\s*(Home|Nonprofit)/i)
  // Some charity-specific text must be present in the rendered DOM.
  const body = (await page.locator('body').innerText()).toLowerCase()
  expect(body).toContain('new heights')
})

test('the canonical matches the URL the page is actually served at', async ({ page }) => {
  await page.goto('./')
  const canonical = await page.locator('link[rel="canonical"]').first().getAttribute('href')
  expect(canonical, 'home page must declare a canonical').toBeTruthy()
  const c = new URL(canonical as string)

  // Asserted on the PATH, not the origin. The origin is baked at build time
  // from the site config, so on any mirror of the deployment it legitimately
  // differs from the host answering the request -- an origin check would fail
  // for a reason that says nothing about the deploy. The path is where the
  // real defect lives: `siteUrl()` folds `NEXT_PUBLIC_BASE_PATH` in, and if
  // that is missing the canonical drops the `/FFC-EX-<domain>` subpath and
  // every indexed URL points one level above the site.
  const served = new URL(page.url())
  const norm = (s: string) => (s.endsWith('/') ? s : `${s}/`)
  expect(
    norm(c.pathname),
    `canonical path ${c.pathname} must match the served path ${served.pathname}`
  ).toBe(norm(served.pathname))

  // ...and its ORIGIN must be the one this repo declares as production.
  //
  // An earlier version hardcoded "not newheightseducation.org", which Copilot
  // called brittle and which was worse than brittle: after the domain cutover
  // that host BECOMES the canonical, so the assertion would have started
  // failing on a correct deployment. `siteConfig.url` is the repo's own
  // declaration of where it lives, and `scripts/check-drift.mjs` already fails
  // CI when it disagrees with `public/CNAME` -- so this is anchored to a value
  // something else keeps honest, and it follows the site through cutover
  // instead of having to be remembered.
  expect(c.origin, `canonical origin must be the configured site origin`).toBe(
    new URL(siteConfig.url).origin
  )
  expect(c.protocol).toBe('https:')
})

test('assets the home page references are actually served', async ({ page, request }) => {
  await page.goto('./')
  const refs = await page.evaluate(() =>
    [
      ...Array.from(document.querySelectorAll('img[src]')).map((e) => (e as HTMLImageElement).src),
      ...Array.from(document.querySelectorAll('link[rel="stylesheet"][href]')).map(
        (e) => (e as HTMLLinkElement).href
      ),
      ...Array.from(document.querySelectorAll('link[rel~="icon"][href]')).map(
        (e) => (e as HTMLLinkElement).href
      ),
    ].filter((u) => u.startsWith('http'))
  )
  const base = new URL(smokeBase())
  // Only our own assets: a third-party CDN being down is not this deploy's fault.
  const own = [...new Set(refs)].filter((u) => new URL(u).origin === base.origin)
  expect(own.length, 'the home page must reference at least one same-origin asset').toBeGreaterThan(
    0
  )

  const broken: string[] = []
  for (const u of own) {
    const res = await request.get(u, { maxRedirects: 5 }).catch(() => null)
    if (!res || res.status() !== 200) broken.push(`${res ? res.status() : 'ERR'}  ${u}`)
  }
  expect(broken.length, `same-origin assets not served:\n${broken.join('\n')}`).toBe(0)
})
