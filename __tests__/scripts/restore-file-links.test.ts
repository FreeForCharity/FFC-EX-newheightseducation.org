/**
 * @jest-environment node
 */
import { fileTarget, restorePage, textRunIndex } from '../../scripts/restore-file-links.mjs'

const has =
  (...paths: string[]) =>
  (p: string) =>
    paths.includes(p)
const LOCAL = '_ffc-assets/school.newheightseducation.org/wp-content/uploads'

describe('fileTarget', () => {
  it('prefers the local copy, then its webp, then a release asset', () => {
    const released = new Map([['b.pdf', 'https://github.com/r/B.pdf']])
    const url = 'https://school.newheightseducation.org/wp-content/uploads'
    expect(fileTarget(`${url}/a.pdf`, released, has(`${LOCAL}/a.pdf`))).toBe(
      `%%BASE%%/${LOCAL}/a.pdf`
    )
    expect(fileTarget(`${url}/p.jpg`, released, has(`${LOCAL}/p.webp`))).toBe(
      `%%BASE%%/${LOCAL}/p.webp`
    )
    expect(fileTarget(`${url}/b.pdf`, released, has())).toBe('https://github.com/r/B.pdf')
    expect(fileTarget(`${url}/c.pdf`, released, has())).toBeNull()
  })
})

describe('restorePage', () => {
  const url = 'https://school.newheightseducation.org/wp-content/uploads'
  const exists = has(`${LOCAL}/one.doc`, `${LOCAL}/two.pdf`)

  it('re-links by position among same-text occurrences', () => {
    const live =
      `<p><a class="btn" href="${url}/one.doc">Download</a></p>` +
      `<p><a href="https://other.org/x.pdf">Download</a></p>` +
      `<p><a class="btn" href="${url}/two.pdf">Download</a></p>`
    const exported =
      '<p>Download</p><p><a href="https://other.org/x.pdf">Download</a></p><p>Download</p>'
    const { html, fixed } = restorePage(live, exported, new Map(), exists)
    expect(fixed).toEqual(['Download', 'Download'])
    expect(html).toBe(
      `<p><a class="btn" href="%%BASE%%/${LOCAL}/one.doc">Download</a></p>` +
        '<p><a href="https://other.org/x.pdf">Download</a></p>' +
        `<p><a class="btn" href="%%BASE%%/${LOCAL}/two.pdf">Download</a></p>`
    )
  })

  it('re-links text the conversion ran together', () => {
    const live = `<p><a href="${url}/one.doc">one</a><a href="${url}/two.pdf">two</a></p>`
    const { html } = restorePage(live, '<p>onetwo</p>', new Map(), exists)
    expect(html).toBe(
      `<p><a href="%%BASE%%/${LOCAL}/one.doc">one</a><a href="%%BASE%%/${LOCAL}/two.pdf">two</a></p>`
    )
  })

  it('reports a file with no copy and skips blank lightbox links', () => {
    const live = `<a href="${url}/gone.pdf">Gone</a><a href="${url}/one.doc">&nbsp;</a>`
    const { html, skipped } = restorePage(live, '<p>Gone</p>', new Map(), exists)
    expect(html).toBe('<p>Gone</p>')
    expect(skipped).toEqual([`Gone (${url}/gone.pdf): no copy`])
  })

  it('re-links bold link text', () => {
    const live = `<p><a href="${url}/two.pdf"><strong>Two</strong></a></p>`
    const { html } = restorePage(live, '<p><strong>Two</strong></p>', new Map(), exists)
    expect(html).toBe(`<p><strong><a href="%%BASE%%/${LOCAL}/two.pdf">Two</a></strong></p>`)
  })

  it('is idempotent', () => {
    const live = `<p><a href="${url}/two.pdf">Two</a></p>`
    const once = restorePage(live, '<p>Two</p>', new Map(), exists).html
    expect(restorePage(live, once, new Map(), exists).html).toBe(once)
  })
})

describe('textRunIndex', () => {
  it('finds text once, outside tags', () => {
    expect(textRunIndex('<p>abc-def</p>', 'def')).toBe(7)
    expect(textRunIndex('<a title="def">def</a>', 'def')).toBe(15)
    expect(textRunIndex('<p>def def</p>', 'def')).toBe(-1)
  })
})
