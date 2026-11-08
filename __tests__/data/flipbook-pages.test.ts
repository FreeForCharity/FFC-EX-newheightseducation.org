/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { issues } from '../../scripts/build-flipbook-pages.mjs'

const manifest = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'src/data/flipbook-pages.json'), 'utf8')
) as { commit: string; issues: Record<string, { pages: number; aspect: number }> }

describe('flipbook page images', () => {
  it('pins the images to one commit of the flipbook-pages branch', () => {
    expect(manifest.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('has page images for every issue with a PDF, and nothing else', () => {
    const slugs = (issues() as { slug: string }[]).map((i) => i.slug).sort()
    expect(Object.keys(manifest.issues).sort()).toEqual(slugs)
  })

  it.each(Object.entries(manifest.issues))('%s has a page count and a page shape', (_, i) => {
    expect(Number.isInteger(i.pages) && i.pages > 0).toBe(true)
    expect(i.aspect).toBeGreaterThan(0.4)
    expect(i.aspect).toBeLessThan(1.2)
  })
})
