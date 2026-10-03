import pins from './media-rendered.json'
import { fileOf, manifest, renderedMedia, sha256 } from '../../scripts/pin-rendered-media.mjs'

/**
 * Every media-library file the pages render is pinned by hash and mapped to its
 * original in the live archive's media manifest (#41), whose originals stay in
 * the release. Files served at their original path are byte-identical or
 * recompressed for the Pages size limit; resized and WebP derivatives are
 * reviewed at their pinned hash. After reviewing a change, re-pin with
 * `node scripts/pin-rendered-media.mjs --write`.
 */

const PINNED: Record<string, { sha256: string; source: string | null }> = pins
const rendered = renderedMedia()
const archived = new Map(manifest().map((entry) => [entry.url, entry]))

describe('rendered media', () => {
  it('finds rendered media to check', () => {
    expect(rendered.size).toBeGreaterThan(1000)
  })

  it('pins exactly the media the pages render', () => {
    expect([...rendered.keys()].filter((path) => !PINNED[path])).toEqual([])
    expect(Object.keys(PINNED).filter((path) => !rendered.has(path))).toEqual([])
  })

  it('serves each file with the hash it was reviewed at', () => {
    const changed = [...rendered.keys()].filter(
      (path) => PINNED[path] && sha256(fileOf(path)) !== PINNED[path].sha256
    )
    expect(changed).toEqual([])
  })

  it('maps each file to an original in the live archive', () => {
    const wrong = [...rendered].filter(
      ([path, source]) => source !== PINNED[path]?.source || (source && !archived.has(source))
    )
    expect(wrong).toEqual([])
    const mapped = [...rendered.values()].filter(Boolean).length
    expect(mapped / rendered.size).toBeGreaterThan(0.95)
  })
})
