import { test, expect } from '@playwright/test'
import { smokeBase, resolveLoc, parseLocs, pool, fetchPage } from './_helpers'

/**
 * Every route the site advertises must actually resolve on the host serving it.
 *
 * This is the check the shared smoke workflow could not run on a default Pages
 * URL, so until now a `github.io` deployment had NO route-level verification at
 * all: the deploy going green meant the artifact uploaded, not that anything in
 * it was reachable. The migration that prompted this publishes ~790 routes, and
 * the failure modes it is exposed to -- a basePath folded in wrongly, an
 * exporter writing a directory the host will not index, a route present in the
 * sitemap but never built -- are all invisible to `next build` and to the local
 * E2E suite, because both of those are the thing under test rather than the
 * host.
 */
test.describe('deployed routes', () => {
  // Worst case is what sets this, not the happy path. ~790 routes at
  // concurrency 16 with a 20s per-request timeout is ceil(790/16) * 20s ~= 17
  // minutes if EVERY request hangs -- so a 10-minute cap would have killed the
  // test before it could report which routes were broken, which is the only
  // thing anyone reads it for. Raised by Copilot on #19.
  //
  // Two changes rather than one: the cap is above the worst case, AND the
  // sweep gives up early (see MAX_FAILURES) so the worst case is not reached.
  // A host failing 25 routes does not need the other 765 checked to prove
  // something is wrong.
  test.setTimeout(20 * 60 * 1000)

  test('the sitemap itself is served and non-empty', async ({ request }) => {
    const url = new URL('sitemap.xml', smokeBase()).toString()
    const res = await request.get(url, { maxRedirects: 5 })
    expect(res.status(), `${url} must be served`).toBe(200)
    const locs = parseLocs(await res.text())
    // A sitemap that parses to nothing would make the route check below pass
    // vacuously -- zero failures out of zero routes. Assert the denominator.
    expect(locs.length, 'sitemap must advertise at least one route').toBeGreaterThan(0)
  })

  test('every advertised route resolves', async ({ request }) => {
    const base = smokeBase()
    const res = await request.get(new URL('sitemap.xml', base).toString(), { maxRedirects: 5 })
    expect(res.status()).toBe(200)
    const locs = parseLocs(await res.text())
    expect(locs.length).toBeGreaterThan(0)

    const urls = locs.map((l) => resolveLoc(l, base))

    // Stop sweeping once the verdict is no longer in doubt. This bounds the
    // run against a host that is down or timing out, and it keeps the report
    // readable: 25 named routes are actionable, 790 are a wall.
    const MAX_FAILURES = 25
    let failures = 0
    const results = await pool(urls, 16, async (u) => {
      if (failures >= MAX_FAILURES) return { code: -1, isPage: true, why: 'not checked' }
      const r = await fetchPage(request, u)
      if (!r.isPage) failures += 1
      return r
    })

    const broken = urls.map((u, i) => ({ url: u, ...results[i] })).filter((r) => !r.isPage)
    const stopped = failures >= MAX_FAILURES
    const checked = results.filter((r) => r.why !== 'not checked').length

    // Reported in full rather than as a count: the first thing anyone reading a
    // failure needs is WHICH routes, and a truncated list sends them to the
    // artifact instead.
    // The early stop introduces a way for this test to pass while measuring
    // nothing: if the threshold were ever reached before any route was
    // checked, `broken` is empty and the assertion below succeeds on a
    // denominator of zero. Assert the denominator, the same way the sitemap
    // test asserts it advertises at least one route.
    expect(checked, 'the sweep must actually check routes').toBeGreaterThan(0)

    const detail = broken.map((b) => `  ${b.why}  ${b.url}`).join('\n')
    const note = stopped
      ? `stopped after ${MAX_FAILURES} failures (${checked} of ${urls.length} checked) -- `
      : ''
    expect(
      broken.length,
      `${note}${broken.length} of ${checked} checked routes did not serve a page:\n${detail}`
    ).toBe(0)
  })
})
