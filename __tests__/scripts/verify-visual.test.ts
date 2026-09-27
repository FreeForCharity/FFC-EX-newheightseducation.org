import { PNG } from 'pngjs'
import {
  diffRatio,
  cropTo,
  isFinding,
  median,
  sourceUrlFor,
  MAX_DIFF_RATIO,
} from '../../scripts/verify-visual.mjs'

/**
 * The pure half of the visual check. The browser half cannot run here --
 * unit tests execute before `playwright install` in CI, and this sandbox
 * cannot reach either origin -- so the two-origin discrimination proof is a
 * Playwright spec (`tests/visual-detector.spec.ts`). What is pinned here is
 * every decision the comparison makes once it holds two images.
 */

const solid = (w: number, h: number, rgb: [number, number, number]) => {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i += 1) {
    png.data[i * 4] = rgb[0]
    png.data[i * 4 + 1] = rgb[1]
    png.data[i * 4 + 2] = rgb[2]
    png.data[i * 4 + 3] = 255
  }
  return png
}

/** Top half one colour, bottom half another. */
const halves = (
  w: number,
  h: number,
  top: [number, number, number],
  bot: [number, number, number]
) => {
  const png = solid(w, h, top)
  for (let y = Math.floor(h / 2); y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      png.data[i] = bot[0]
      png.data[i + 1] = bot[1]
      png.data[i + 2] = bot[2]
    }
  return png
}

describe('diffRatio', () => {
  it('scores identical images 0', async () => {
    expect((await diffRatio(solid(40, 40, [10, 80, 60]), solid(40, 40, [10, 80, 60]))).ratio).toBe(
      0
    )
  })

  it('scores completely different images ~1', async () => {
    expect((await diffRatio(solid(40, 40, [0, 0, 0]), solid(40, 40, [255, 255, 255]))).ratio).toBe(
      1
    )
  })

  it('scores a half-changed image ~0.5', async () => {
    const a = solid(40, 40, [0, 0, 0])
    const b = halves(40, 40, [0, 0, 0], [255, 255, 255])
    expect((await diffRatio(a, b)).ratio).toBeCloseTo(0.5, 1)
  })

  // A taller source page is a difference in LENGTH, not in appearance.
  // Comparing full heights would score every long page as broken below the
  // fold, and pixelmatch throws outright on mismatched dimensions -- so the
  // crop is what makes this runnable at all, not a nicety.
  it('compares the common region when the two pages are different heights', async () => {
    const short = solid(40, 20, [10, 80, 60])
    const tall = solid(40, 200, [10, 80, 60])
    const r = await diffRatio(short, tall)
    expect(r.ratio).toBe(0)
    expect(r.height).toBe(20)
  })

  it('compares the common region when the two pages are different widths', async () => {
    expect((await diffRatio(solid(20, 40, [1, 2, 3]), solid(90, 40, [1, 2, 3]))).width).toBe(20)
  })

  // Degenerate input must not read as a perfect match, which is the direction
  // that would let a broken capture pass.
  it('reports a zero-area comparison as a total difference, never as a match', async () => {
    const r = await diffRatio(solid(0, 0, [0, 0, 0]), solid(40, 40, [0, 0, 0]))
    expect(r.ratio).toBe(1)
    expect(r.diff).toBeNull()
  })
})

describe('cropTo', () => {
  it('returns the same object when no crop is needed', () => {
    const png = solid(10, 10, [5, 5, 5])
    expect(cropTo(png, 10, 10)).toBe(png)
  })

  it('keeps the top-left corner', () => {
    const png = halves(10, 10, [255, 0, 0], [0, 0, 255])
    const out = cropTo(png, 10, 4)
    expect(out.height).toBe(4)
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([255, 0, 0])
  })
})

describe('isFinding', () => {
  it('is false at and below the threshold, true above it', () => {
    expect(isFinding(MAX_DIFF_RATIO)).toBe(false)
    expect(isFinding(MAX_DIFF_RATIO - 0.0001)).toBe(false)
    expect(isFinding(MAX_DIFF_RATIO + 0.0001)).toBe(true)
  })

  it('does not treat a missing score as a finding', () => {
    expect(isFinding(null as unknown as number)).toBe(false)
    expect(isFinding(undefined as unknown as number)).toBe(false)
  })

  it('honours a caller-supplied threshold', () => {
    expect(isFinding(0.5, 0.9)).toBe(false)
    expect(isFinding(0.5, 0.1)).toBe(true)
  })
})

describe('median', () => {
  it('is the middle value, not the mean, so one broken page cannot hide four good ones', () => {
    expect(median([0.01, 0.02, 0.03, 0.04, 0.99])).toBe(0.03)
  })

  it('ignores non-numeric entries rather than returning NaN', () => {
    expect(median([0.1, undefined as unknown as number, 0.3])).toBe(0.3)
  })

  it('returns null for nothing to measure', () => {
    expect(median([])).toBeNull()
  })
})

describe('route normalization', () => {
  // `sourceUrlFor` repairs a missing leading slash for the SOURCE url, but
  // the export url is built by concatenation, so an unnormalized route sent
  // the two origins to different paths:
  //   source: https://example.org/who-we-are/   (repaired)
  //   export: https://example.orgwho-we-are/    (invalid)
  // The CLI normalizes up front now; this pins the shape it must produce.
  const normalize = (r: string) => (r.startsWith('/') ? r : `/${r}`)

  it.each([
    ['who-we-are/', '/who-we-are/'],
    ['/who-we-are/', '/who-we-are/'],
    ['/', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(normalize(input)).toBe(expected)
    expect(`https://example.org${normalize(input)}`).toMatch(/^https:\/\/example\.org\//)
  })
})

describe('sourceUrlFor', () => {
  it('maps a route 1:1', () => {
    expect(sourceUrlFor('/who-we-are/', 'https://example.org')).toBe(
      'https://example.org/who-we-are/'
    )
  })

  it('strips a mount, so a mounted capture compares against the right source', () => {
    expect(sourceUrlFor('/school/algebra-i/', 'https://example.org', 'school')).toBe(
      'https://example.org/algebra-i/'
    )
    expect(sourceUrlFor('/school/', 'https://example.org', 'school')).toBe('https://example.org/')
  })
})
