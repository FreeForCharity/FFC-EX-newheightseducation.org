/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { isChrome } from '../../scripts/repair-descriptions.mjs'

const APP_DIR = path.join(process.cwd(), 'src', 'app')

function pages(dir = APP_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return pages(full)
    return entry.name === 'page.tsx' ? [full] : []
  })
}

describe('meta descriptions', () => {
  const described = pages()
    .map((file) => ({
      page: path.relative(APP_DIR, file),
      description: fs
        .readFileSync(file, 'utf8')
        .match(/description:\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/)?.[2],
    }))
    .filter((p): p is { page: string; description: string } => p.description !== undefined)

  it('finds the pages', () => {
    expect(described.length).toBeGreaterThan(700)
  })

  it('never quotes the page chrome (cart, login, the email fallback)', () => {
    expect(described.filter((p) => isChrome(p.description)).map((p) => p.page)).toEqual([])
  })

  it('never leaves an HTML entity undecoded', () => {
    expect(
      described.filter((p) => /&(?:[a-z]+|#\d+);/.test(p.description)).map((p) => p.page)
    ).toEqual([])
  })
})
