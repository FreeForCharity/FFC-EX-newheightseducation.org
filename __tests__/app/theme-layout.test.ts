import fs from 'fs'
import path from 'path'

const APP_DIR = path.join(__dirname, '../../src/app')
const CONTENT_DIR = path.join(__dirname, '../../src/clone-content')
const css = fs.readFileSync(path.join(APP_DIR, 'theme-layout.css'), 'utf8')
const suffixes = [...css.matchAll(/\[data-vc-parallax-image\$='([^']+)'\]/g)].map((m) => m[1])

function htmlFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return htmlFiles(full)
    return e.name.endsWith('.html') ? [full] : []
  })
}

describe('theme-layout.css', () => {
  it('paints every captured parallax image with exactly one rule', () => {
    const values = new Set(
      htmlFiles(CONTENT_DIR).flatMap((f) =>
        [...fs.readFileSync(f, 'utf8').matchAll(/data-vc-parallax-image="([^"]+)"/g)].map(
          (m) => m[1]
        )
      )
    )
    expect(values.size).toBeGreaterThan(0)
    for (const v of values) {
      expect([v, suffixes.filter((s) => v.endsWith(s)).length]).toEqual([v, 1])
    }
  })

  it('serves every background from a committed file, never a remote host', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])
    expect(urls).toHaveLength(suffixes.length)
    for (const u of urls) {
      expect(u).not.toMatch(/^(https?:)?\/\//)
      expect(fs.existsSync(path.join(APP_DIR, u))).toBe(true)
    }
  })

  it('is imported by the root layout', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8')
    expect(layout).toContain("import './theme-layout.css'")
  })
})
