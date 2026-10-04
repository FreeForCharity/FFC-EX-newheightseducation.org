/**
 * @jest-environment node
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { groupFindings, routesOf } from '../../scripts/sweep-layout.mjs'

describe('routesOf', () => {
  it('lists every directory with an index.html, skipping assets and the search index', () => {
    const out = mkdtempSync(join(tmpdir(), 'sweep-'))
    for (const dir of ['', 'about', 'about/team', '_ffc-assets/x', 'pagefind/y', 'empty']) {
      mkdirSync(join(out, dir), { recursive: true })
    }
    for (const dir of ['', 'about', 'about/team', '_ffc-assets/x', 'pagefind/y']) {
      writeFileSync(join(out, dir, 'index.html'), '')
    }
    expect(routesOf(out)).toEqual(['/', '/about/', '/about/team/'])
    rmSync(out, { recursive: true, force: true })
  })
})

describe('groupFindings', () => {
  it('groups views by issue, most widespread first', () => {
    expect(
      groupFindings([
        { route: '/a/', viewport: 'mobile', issues: ['overflow: div', 'broken image: x.png'] },
        { route: '/b/', viewport: 'desktop', issues: ['overflow: div'] },
      ])
    ).toEqual({
      'overflow: div': ['/a/ @mobile', '/b/ @desktop'],
      'broken image: x.png': ['/a/ @mobile'],
    })
  })
})
