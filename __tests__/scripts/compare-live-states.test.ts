/**
 * @jest-environment node
 */
import { PNG } from 'pngjs'
import {
  expandScenarios,
  paintRects,
  rootSelector,
  stateDiff,
  urlFor,
  verdict,
} from '../../scripts/compare-live-states.mjs'
import { SCENARIOS } from '../../scripts/live-state-scenarios.mjs'

describe('expandScenarios', () => {
  it('makes one run per viewport, desktop by default', () => {
    const runs = expandScenarios([
      { name: 'menu', url: 'https://x/', viewports: ['phone', 'tablet'] },
      { name: 'page', url: 'https://x/' },
    ])
    expect(runs.map((r: { id: string }) => r.id)).toEqual([
      'menu.phone',
      'menu.tablet',
      'page.desktop',
    ])
  })

  it('gives every shipped scenario a unique id', () => {
    const ids = expandScenarios(SCENARIOS).map((r: { id: string }) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('urlFor', () => {
  const scenario = { url: 'https://publications.newheightseducation.org/books/' }

  it('uses the live url on the live side', () => {
    expect(urlFor(scenario, 'live')).toBe(scenario.url)
  })

  it('maps to the export route on an export origin', () => {
    expect(urlFor(scenario, 'http://localhost:3000/')).toBe(
      'http://localhost:3000/publications/books/'
    )
  })
})

describe('rootSelector', () => {
  it('reads the live body against the export clone root', () => {
    expect(rootSelector('live')).toBe('body')
    expect(rootSelector('http://localhost:3000')).toBe('.ffc-clone')
  })
})

describe('stateDiff and verdict', () => {
  const open = { root: { classes: ['ast-main-header-nav-open'] }, links: ['A', 'B'] }

  it('finds nothing when both sides agree', () => {
    expect(stateDiff(open, structuredClone(open))).toEqual([])
    expect(verdict({ diffs: [], ratio: 0.001 }, 0.005)).toBe('ok')
  })

  it('reports each field that differs, including a missing one', () => {
    const closed = { root: { classes: [] }, links: ['A'] }
    expect(stateDiff(open, closed).map((d: { key: string }) => d.key)).toEqual(['root', 'links'])
    expect(stateDiff({ a: 1 }, {})).toEqual([{ key: 'a', a: 1, b: null }])
  })

  it('fails on state before pixels, and only judges pixels when a limit is set', () => {
    expect(verdict({ diffs: [{ key: 'x' }], ratio: 0 }, 0.005)).toBe('state-mismatch')
    expect(verdict({ diffs: [], ratio: 0.2 }, 0.005)).toBe('pixels')
    expect(verdict({ diffs: [], ratio: 0.2 }, undefined)).toBe('ok')
  })
})

describe('paintRects', () => {
  it('fills the rect and leaves the rest alone, clamped to the image', () => {
    const png = new PNG({ width: 4, height: 4 })
    png.data.fill(0)
    paintRects(png, [{ x: 2, y: 2, width: 10, height: 10 }])
    expect(png.data.readUInt32BE((3 * 4 + 3) * 4)).toBe(0xff00ffff)
    expect(png.data.readUInt32BE(0)).toBe(0)
  })
})
