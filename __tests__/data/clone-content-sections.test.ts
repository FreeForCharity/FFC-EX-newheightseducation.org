/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')

function fragments(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return fragments(full)
    return entry.name.endsWith('.html') ? [full] : []
  })
}

const rel = (file: string) => path.relative(CONTENT_DIR, file)

describe.each(['school', 'radio'])('the %s section', (section) => {
  const pages = [
    path.join(CONTENT_DIR, `${section}.html`),
    ...fragments(path.join(CONTENT_DIR, section)),
  ]

  it('has its pages', () => {
    expect(pages.length).toBeGreaterThan(section === 'school' ? 100 : 20)
  })

  it.each(['theme-styles-css', 'theme-options-css'])('links the Jupiter %s stylesheet', (id) => {
    const missing = pages.filter((f) => !fs.readFileSync(f, 'utf8').includes(`id='${id}'`))
    expect(missing.map(rel)).toEqual([])
  })
})

describe('links to the retired subdomains', () => {
  it('point at the local section or asset, not school., publications. or radio.', () => {
    const offenders = fragments(CONTENT_DIR).flatMap((f) =>
      [
        ...fs
          .readFileSync(f, 'utf8')
          .matchAll(
            /\b(?:href|src)=["']https?:\/\/(?:school|publications|radio)\.newheightseducation\.org[^"']*/gi
          ),
      ].map((m) => `${rel(f)}: ${m[0]}`)
    )
    expect(offenders).toEqual([])
  })
})
