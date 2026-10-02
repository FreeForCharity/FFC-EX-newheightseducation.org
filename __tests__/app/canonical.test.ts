import fs from 'fs'
import path from 'path'
import { discoverRoutes, APP_DIR } from '../../src/app/sitemap'

function declaredCanonical(source: string): string | undefined {
  const literal = source.match(/canonical:\s*'([^']*)'/)
  if (literal) return literal[1]
  const constant = source.match(/const CANONICAL_PATH = '([^']*)'/)
  return constant?.[1]
}

describe('per-page canonical', () => {
  const pages = discoverRoutes().map((route) => ({
    route: route.endsWith('/') ? route : `${route}/`,
    source: fs.readFileSync(path.join(APP_DIR, route, 'page.tsx'), 'utf8'),
  }))

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThan(400)
  })

  it('declares the URL the page is served at, matching the sitemap', () => {
    const wrong = pages
      .map(({ route, source }) => ({ route, canonical: declaredCanonical(source) }))
      .filter(({ route, canonical }) => canonical !== route)
    expect(wrong).toEqual([])
  })
})
