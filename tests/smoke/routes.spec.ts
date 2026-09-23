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
  // ~790 requests across the public internet.
  test.setTimeout(10 * 60 * 1000)

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
    const results = await pool(urls, 16, (u) => fetchPage(request, u))

    const broken = urls.map((u, i) => ({ url: u, ...results[i] })).filter((r) => !r.isPage)

    // Reported in full rather than as a count: the first thing anyone reading a
    // failure needs is WHICH routes, and a truncated list sends them to the
    // artifact instead.
    const detail = broken.map((b) => `  ${b.why}  ${b.url}`).join('\n')
    expect(
      broken.length,
      `${broken.length} of ${urls.length} advertised routes did not serve a page:\n${detail}`
    ).toBe(0)
  })
})
