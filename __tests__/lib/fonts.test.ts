// next/font/local cannot be called outside of Next.js module scope in Jest,
// so these check the source file, as in FFC-EX-theeverythingproject.org.

import fs from 'fs'
import path from 'path'

const fontsSource = fs.readFileSync(path.join(__dirname, '../../src/lib/fonts.ts'), 'utf8')

describe('lib/fonts', () => {
  it('exports the three fonts the template uses', () => {
    for (const name of ['openSans', 'lato', 'faustina']) {
      expect(fontsSource).toContain(`export const ${name}`)
    }
    expect(fontsSource.match(/export const /g)).toHaveLength(3)
  })

  it('self-hosts fonts instead of fetching from Google at build time', () => {
    expect(fontsSource).toContain("from 'next/font/local'")
    expect(fontsSource).not.toContain('next/font/google')
  })

  it('configures every font with swap display', () => {
    expect(fontsSource.match(/display:\s*'swap'/g)).toHaveLength(3)
  })

  it('points every font at a committed woff2 file', () => {
    const files = [...fontsSource.matchAll(/'\.\.\/fonts\/([\w-]+\.woff2)'/g)].map((m) => m[1])
    expect(files).toHaveLength(4)
    for (const file of files) {
      expect(fs.existsSync(path.join(__dirname, '../../src/fonts', file))).toBe(true)
    }
  })

  it('covers the weights the template used from Google', () => {
    expect(fontsSource).toContain("weight: '400 800'")
    expect(fontsSource).toContain("weight: '400 700'")
    expect(fontsSource).toMatch(/lato-400\.woff2', weight: '400'/)
    expect(fontsSource).toMatch(/lato-700\.woff2', weight: '700'/)
  })

  it('sets the CSS variable for each font', () => {
    for (const variable of ['--font-open-sans', '--font-lato', '--font-faustina']) {
      expect(fontsSource).toContain(variable)
    }
  })
})
