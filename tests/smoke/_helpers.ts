import type { APIRequestContext } from '@playwright/test'

/** The deployed origin + subpath these specs run against. Always ends in `/`. */
export function smokeBase(): string {
  const raw =
    process.env.SMOKE_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    'https://freeforcharity.github.io/FFC-EX-newheightseducation.org/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

/**
 * Resolve a sitemap `<loc>` to the URL these specs should request.
 *
 * Same-origin locs are used VERBATIM, which matters on the default Pages URL:
 * the sitemap already carries the `/FFC-EX-<domain>` subpath (siteUrl() folds
 * `NEXT_PUBLIC_BASE_PATH` in at build time), so re-joining the path onto a
 * base that already ends with that subpath would double it and 404 every
 * route — while looking like a real finding.
 *
 * A loc from a DIFFERENT origin is remapped by path, so the suite still works
 * when pointed at a preview host or after a custom-domain cutover.
 */
export function resolveLoc(loc: string, base = smokeBase()): string {
  const b = new URL(base)
  const u = new URL(loc)
  if (u.origin === b.origin) return u.toString()
  // Cross-origin: the loc may ALREADY carry the same subpath the base ends
  // with (a local mirror of a subpath deploy is the ordinary case, and it is
  // how this suite is exercised without the live host). Joining blindly would
  // double it and 404 every route while looking like a real finding.
  let path = u.pathname
  if (b.pathname !== '/' && path.startsWith(b.pathname)) {
    path = path.slice(b.pathname.length)
  }
  return new URL(path.replace(/^\//, '') + u.search, b).toString()
}

/** Extract every `<loc>` from a sitemap document. */
export function parseLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter(Boolean)
}

/**
 * Run `work` over `items` with bounded concurrency.
 *
 * A site of ~800 routes is the normal case for a WordPress migration, and
 * issuing those serially takes long enough that the check gets cut for time --
 * which is how a post-deploy suite quietly stops covering the thing it exists
 * for.
 */
export async function pool<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await work(items[i])
    }
  })
  await Promise.all(runners)
  return out
}

/**
 * GET a URL and report whether it actually served a PAGE.
 *
 * Not just the status: a directory that exists without an index answers `200`
 * with a file listing on several static servers, and a host with a soft-404
 * answers `200` with an error page. Mutation testing caught exactly this --
 * deleting a route's `index.html` left the check green, because the status was
 * still 200. A response that carries no `<title>` is not the page the sitemap
 * advertised, whatever the code says.
 *
 * The body is already downloaded by the request, so this costs nothing extra.
 */
export async function fetchPage(
  request: APIRequestContext,
  url: string
): Promise<{ code: number; isPage: boolean; why: string }> {
  try {
    const res = await request.get(url, { maxRedirects: 5, timeout: 20_000 })
    const code = res.status()
    if (code !== 200) return { code, isPage: false, why: `HTTP ${code}` }
    const body = await res.text()
    // A canonical, not a <title>: mutation testing showed a directory listing
    // has a perfectly good <title> ("Files within ...") and sailed through.
    // Every indexable page of this site carries `<link rel="canonical">` --
    // `pnpm run verify:build` fails the build otherwise -- so its absence
    // means whatever came back is not one of our pages.
    if (!/<link[^>]+rel=["']canonical["']/i.test(body)) {
      return {
        code,
        isPage: false,
        why: '200 without a canonical (directory listing or soft 404?)',
      }
    }
    return { code, isPage: true, why: 'ok' }
  } catch (err) {
    return { code: 0, isPage: false, why: `transport: ${(err as Error).message.slice(0, 80)}` }
  }
}
