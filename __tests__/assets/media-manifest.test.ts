import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import recompressed from './media-recompressed.json'

/**
 * Each media-library file the site serves at its original path must be the
 * file the live site had: byte-identical to the sha256 in the live archive's
 * media manifest (#41), or the reviewed recompression of it (made to keep the
 * export under the Pages size limit) whose hash is pinned in
 * media-recompressed.json. The archived original stays in the release.
 */

const ROOT = join(__dirname, '..', '..')
const ARCHIVE = join(ROOT, 'docs', 'live-archive', '2026-10-02')
const ASSETS = join(ROOT, 'public', '_ffc-assets')
const PINNED: Record<string, string> = recompressed

type Entry = { url: string; bytes: number; sha256: string }

const served = readdirSync(ARCHIVE)
  .filter((f) => f.startsWith('media-manifest.'))
  .flatMap((f) => JSON.parse(readFileSync(join(ARCHIVE, f), 'utf8')) as Entry[])
  .map((entry) => ({ ...entry, local: join(ASSETS, entry.url.replace(/^https?:\/\//, '')) }))
  .filter((entry) => existsSync(entry.local))

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('media served at its original path', () => {
  it('finds files to check', () => {
    expect(served.length).toBeGreaterThan(100)
  })

  it('matches the live archive or its pinned recompression', () => {
    const wrong = served.flatMap(({ url, sha256: archived, local }) => {
      const actual = sha256(local)
      return actual === archived || actual === PINNED[url] ? [] : [{ url, actual }]
    })
    expect(wrong).toEqual([])
  })

  it('pins only recompressions of files the site still serves', () => {
    const urls = new Set(served.map(({ url }) => url))
    expect(Object.keys(PINNED).filter((url) => !urls.has(url))).toEqual([])
  })
})
