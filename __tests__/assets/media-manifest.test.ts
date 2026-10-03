import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'

/**
 * Each media-library file the site serves at its original path must be the
 * file the live site had: byte-identical to the sha256 in the live archive's
 * media manifest (#41), or a recompression of it (same format, no larger) made
 * to keep the export under the Pages size limit.
 */

const ROOT = join(__dirname, '..', '..')
const ARCHIVE = join(ROOT, 'docs', 'live-archive', '2026-10-02')
const ASSETS = join(ROOT, 'public', '_ffc-assets')

type Entry = { url: string; bytes: number; sha256: string }

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  '.pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  '.png': (b) => b.subarray(1, 4).toString('latin1') === 'PNG',
  '.gif': (b) => b.subarray(0, 3).toString('latin1') === 'GIF',
  '.webp': (b) =>
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP',
}

const served = readdirSync(ARCHIVE)
  .filter((f) => f.startsWith('media-manifest.'))
  .flatMap((f) => JSON.parse(readFileSync(join(ARCHIVE, f), 'utf8')) as Entry[])
  .map((entry) => ({ ...entry, local: join(ASSETS, entry.url.replace(/^https?:\/\//, '')) }))
  .filter((entry) => existsSync(entry.local))

describe('media served at its original path', () => {
  it('finds files to check', () => {
    expect(served.length).toBeGreaterThan(100)
  })

  it('matches the live archive, or is a smaller copy of the same format', () => {
    const wrong = served.flatMap(({ url, bytes, sha256, local }) => {
      const body = readFileSync(local)
      if (createHash('sha256').update(body).digest('hex') === sha256) return []
      const isFormat = MAGIC[extname(local).toLowerCase()]
      if (isFormat?.(body) && body.length <= bytes) return []
      return [{ url, archived: bytes, served: body.length }]
    })
    expect(wrong).toEqual([])
  })
})
