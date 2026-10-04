/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { isPlaceholder, lazyTarget } from '../../scripts/restore-lazy-images.mjs'
import unresolved from './lazy-images-unresolved.json'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')
const ASSETS = path.join(process.cwd(), 'public', '_ffc-assets')

function fragments(dir = CONTENT_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return fragments(full)
    return entry.name.endsWith('.html') ? [full] : []
  })
}
const all = fragments().map((file) => ({
  slug: path.relative(CONTENT_DIR, file).replace(/\.html$/, ''),
  html: fs.readFileSync(file, 'utf8'),
}))
const ALLOWED: Record<string, string> = unresolved

describe('Jupiter lazy images', () => {
  const placeholders = all.flatMap(({ slug, html }) =>
    [...html.matchAll(/<img\b[^>]*\sdata-mk-image-src-set='([^']*)'[^>]*>/g)]
      .filter((m) => isPlaceholder(m[0].match(/\ssrc="([^"]*)"/)?.[1]))
      .map((m) => ({ slug, target: lazyTarget(m[1], slug) }))
      .filter((p) => p.target)
  )

  it('shows a real image wherever the live site lazy-loaded one', () => {
    const offenders = placeholders.filter(({ target }) => !(target! in ALLOWED))
    expect(offenders).toEqual([])
  })

  it('lists only images that are still placeholders', () => {
    const still = new Set(placeholders.map(({ target }) => target))
    expect(Object.keys(ALLOWED).filter((t) => !still.has(t))).toEqual([])
  })

  it('serves every image a fragment points at', () => {
    const missing = all.flatMap(({ slug, html }) =>
      [...html.matchAll(/<img\b[^>]*\ssrc="%%BASE%%\/_ffc-assets\/([^"?#]+)"/g)]
        .map((m) => m[1])
        .filter((p) => !fs.existsSync(path.join(ASSETS, decodeURIComponent(p))))
        .map((p) => `${slug}: ${p}`)
    )
    expect(missing).toEqual([])
  })
})

describe('lazyTarget', () => {
  const set = (url: string) => JSON.stringify({ default: url, '2x': '' })

  it('resolves page-relative paths to their host', () => {
    expect(lazyTarget(set('../radio/wp-content/uploads/a.jpg'), 'radio')).toBe(
      'radio.newheightseducation.org/wp-content/uploads/a.jpg'
    )
    expect(lazyTarget(set('../../wp-content/uploads/b.jpg'), 'category/nheg-news')).toBe(
      'newheightseducation.org/wp-content/uploads/b.jpg'
    )
    expect(lazyTarget(set('wp-content/uploads/c.jpg'), 'index')).toBe(
      'newheightseducation.org/wp-content/uploads/c.jpg'
    )
  })

  it('takes tokenized and absolute paths as they are', () => {
    expect(lazyTarget(set('%%BASE%%/_ffc-assets/newheightseducation.org/x.webp'), 'shop')).toBe(
      'newheightseducation.org/x.webp'
    )
    expect(
      lazyTarget(set('https://www.newheightseducation.org/wp-content/uploads/d.png'), 'shop')
    ).toBe('newheightseducation.org/wp-content/uploads/d.png')
  })

  it("ignores WordPress's default placeholder", () => {
    expect(lazyTarget(set('../wp-includes/images/media/default.svg'), 'shop')).toBeNull()
  })
})
