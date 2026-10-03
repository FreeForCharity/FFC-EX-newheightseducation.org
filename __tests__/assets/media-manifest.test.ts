import { existsSync } from 'node:fs'
import derivatives from './media-rendered.json'
import recompressed from './media-recompressed.json'
import {
  fileOf,
  isOriginalPath,
  manifest,
  renderedMedia,
  sha256,
} from '../../scripts/pin-rendered-media.mjs'

/**
 * Media parity with the live archive (#41), whose originals stay in the
 * release. A file served at its original's path must have the manifest's
 * sha256, unless it is a reviewed recompression for the Pages size limit,
 * listed by hand in media-recompressed.json. A rendered resized or WebP
 * derivative has no archived hash; it must map to an archived original and
 * match its reviewed pin in media-rendered.json (re-pin with
 * `node scripts/pin-rendered-media.mjs --write`).
 */

const PINNED: Record<string, { sha256: string; source: string | null }> = derivatives
const RECOMPRESSED: Record<string, string> = recompressed
const archived = manifest().map((entry) => ({
  ...entry,
  path: entry.url.replace(/^https?:\/\//, ''),
}))
const atOriginalPath = archived.filter(({ path }) => existsSync(fileOf(path)))
const rendered = renderedMedia()

describe('media at its original path', () => {
  it('finds files to check', () => {
    expect(atOriginalPath.length).toBeGreaterThan(100)
  })

  it('matches the archived sha256, or its reviewed recompression', () => {
    const wrong = atOriginalPath.flatMap(({ path, sha256: expected }) => {
      const actual = sha256(fileOf(path))
      return actual === expected || actual === RECOMPRESSED[path] ? [] : [{ path, actual }]
    })
    expect(wrong).toEqual([])
  })

  it('lists only recompressions of files still served at their original path', () => {
    const served = new Set(atOriginalPath.map(({ path }) => path))
    expect(Object.keys(RECOMPRESSED).filter((path) => !served.has(path))).toEqual([])
  })
})

describe('rendered derivatives', () => {
  const rendition = [...rendered].filter(([path, source]) => !isOriginalPath(path, source))
  const sources = new Set(archived.map(({ url }) => url))

  it('pins exactly the derivatives the pages render', () => {
    expect(rendition.length).toBeGreaterThan(1000)
    expect(rendition.filter(([path]) => !PINNED[path]).map(([path]) => path)).toEqual([])
    const live = new Set(rendition.map(([path]) => path))
    expect(Object.keys(PINNED).filter((path) => !live.has(path))).toEqual([])
  })

  it('serves each derivative with the hash it was reviewed at', () => {
    const changed = rendition.filter(([path]) => sha256(fileOf(path)) !== PINNED[path]?.sha256)
    expect(changed.map(([path]) => path)).toEqual([])
  })

  it('maps derivatives to an original in the live archive', () => {
    const wrong = rendition.filter(
      ([path, source]) => source !== PINNED[path]?.source || (source && !sources.has(source))
    )
    expect(wrong).toEqual([])
    const mapped = rendition.filter(([, source]) => source).length
    expect(mapped / rendition.length).toBeGreaterThan(0.95)
  })
})
