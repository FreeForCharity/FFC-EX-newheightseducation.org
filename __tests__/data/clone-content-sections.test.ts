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

describe('linked stylesheets', () => {
  it('end in .css, so GitHub Pages serves them as text/css (#44)', () => {
    const offenders = fragments(CONTENT_DIR).flatMap((f) =>
      [...fs.readFileSync(f, 'utf8').matchAll(/<link\b[^>]*>/gi)]
        .map((m) => m[0])
        .filter((tag) => /\brel=(['"])stylesheet\1/i.test(tag))
        .map((tag) => tag.match(/\bhref=(['"])([^'"]+)\1/i)?.[2] ?? '')
        .concat(
          [
            ...fs
              .readFileSync(f, 'utf8')
              .matchAll(/@import\s+(?:url\(\s*)?(["']?)([^"'()\s;]+)\1/gi),
          ].map((m) => m[2])
        )
        .filter((href) => href.startsWith('%%BASE%%/') && !/\.css$/i.test(href))
        .map((href) => `${rel(f)}: ${href}`)
    )
    expect(offenders).toEqual([])
  })

  // The template's own components share the page, so a captured stylesheet
  // left global restyles them (the cookie banner on /school/, #44).
  it('are scoped to the captured markup', () => {
    const sheets = new Set(
      fragments(CONTENT_DIR).flatMap((f) =>
        [...fs.readFileSync(f, 'utf8').matchAll(/<link\b[^>]*>/gi)]
          .map((m) => m[0])
          .filter((tag) => /\brel=(['"])stylesheet\1/i.test(tag))
          .map((tag) => tag.match(/\bhref=(['"])%%BASE%%\/([^'"]+)\1/i)?.[2])
          .filter((href): href is string => Boolean(href))
      )
    )
    expect(sheets.size).toBeGreaterThan(50)
    const unscoped = [...sheets].flatMap((sheet) => {
      const css = fs.readFileSync(path.join(process.cwd(), 'public', sheet), 'utf8')
      const bad = unscopedSelectors(css)
      return bad.length ? [`${sheet}: ${bad.slice(0, 3).join(' | ')}`] : []
    })
    expect(unscoped).toEqual([])
  })
})

/**
 * Selectors outside `@keyframes` that do not start with `.ffc-clone`, or that
 * do only because a prefix was wrongly put on an at-rule or a keyframe step.
 */
function unscopedSelectors(css: string): string[] {
  const bad: string[] = []
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""')
  let depth = 0
  let keyframes = -1
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      const prelude = text.slice(start, i).trim()
      if (prelude.startsWith('@')) {
        if (/^@(-[a-z]+-)?keyframes\b/i.test(prelude) && keyframes === -1) keyframes = depth
      } else if (keyframes === -1 || depth <= keyframes) {
        for (const sel of prelude.split(',').map((s) => s.trim())) {
          // A prefixed at-rule or keyframe step is malformed, not scoped.
          if (
            sel &&
            (!/^\.ffc-clone(?![\w-])/.test(sel) ||
              /@|^\.ffc-clone\s+(?:[\d.]+%|from|to)$/.test(sel))
          )
            bad.push(sel)
        }
      }
      depth++
      start = i + 1
    } else if (text[i] === '}') {
      depth--
      if (keyframes !== -1 && depth <= keyframes) keyframes = -1
      start = i + 1
    } else if (text[i] === ';' && depth === 0) {
      start = i + 1
    }
  }
  return bad
}
