import fs from 'fs'
import path from 'path'

const APP_DIR = path.join(__dirname, '../../src/app')
const css = fs.readFileSync(path.join(APP_DIR, 'theme-fonts.css'), 'utf8')
const faces = css.match(/@font-face\s*{[^}]*}/g) ?? []

describe('theme-fonts.css', () => {
  it.each(['Oswald', 'Merriweather'])(
    'declares %s under the name the captured CSS uses',
    (family) => {
      expect(faces.some((f) => f.includes(`font-family: '${family}'`))).toBe(true)
    }
  )

  it('serves every face from a committed file, never a remote host', () => {
    const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1])
    expect(urls).toHaveLength(faces.length)
    for (const u of urls) {
      expect(u).not.toMatch(/^(https?:)?\/\//)
      expect(fs.existsSync(path.join(APP_DIR, u))).toBe(true)
    }
  })

  it('is imported by the root layout', () => {
    const layout = fs.readFileSync(path.join(APP_DIR, 'layout.tsx'), 'utf8')
    expect(layout).toContain("import './theme-fonts.css'")
  })
})
