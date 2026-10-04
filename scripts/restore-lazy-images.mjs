#!/usr/bin/env node
/**
 * Restores the images Jupiter lazy-loaded. The capture kept each one as a
 * transparent placeholder `src` plus a `data-mk-image-src-set` that Jupiter's
 * script swapped in; that script is gone, and the set's paths are page-relative
 * WordPress paths the export does not serve. This points `src` at a served
 * copy instead, in this order:
 *
 *   1. the file the set names, if the export serves it (or its WebP twin);
 *   2. the exact crop from `--cache` (files saved from the live site);
 *   3. the original from `--media` (the #41 media zips), resized to 800 px.
 *
 * New files go next to their original's path, so pin-rendered-media.mjs maps
 * them to the archive. Images none of these can supply keep the placeholder
 * and are listed in `__tests__/data/lazy-images-unresolved.json`. Safe to re-run.
 *
 * Conversion needs libwebp's `cwebp` and `gif2webp` (`apt install webp`,
 * `brew install webp`).
 *
 *   node scripts/restore-lazy-images.mjs --cache <dir> --media <zip>...
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { imageSize } from './image-size.mjs'
import { manifest } from './pin-rendered-media.mjs'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const ASSETS = join(ROOT, 'public', '_ffc-assets')
export const UNRESOLVED = join(ROOT, '__tests__', 'data', 'lazy-images-unresolved.json')

export const LAZY_IMG = /<img\b[^>]*\sdata-mk-image-src-set='([^']*)'[^>]*>/g
const SECTION_HOSTS = { school: 'school', publications: 'publications', radio: 'radio' }

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

/** The image the set names, as a host-qualified path, or null for a placeholder. */
export function lazyTarget(set, slug) {
  let url
  try {
    url = JSON.parse(set).default
  } catch {
    return null
  }
  if (!url || /\/wp-includes\/images\/media\/default\.svg$/.test(url)) return null
  if (url.startsWith('%%BASE%%/_ffc-assets/')) return url.slice('%%BASE%%/_ffc-assets/'.length)
  const abs = url.match(/^(?:https?:)?\/\/(?:www\.)?([^/]+)(\/.*)$/)
  if (abs) return abs[1] + abs[2]
  const route = slug === 'index' ? '/' : `/${slug}/`
  const [first, ...rest] = posix.normalize(posix.join(route, url)).replace(/^\//, '').split('/')
  return first in SECTION_HOSTS
    ? [`${SECTION_HOSTS[first]}.newheightseducation.org`, ...rest].join('/')
    : ['newheightseducation.org', first, ...rest].join('/')
}

export const isPlaceholder = (src) => /\/bfi_thumb\/dummy-transparent-/.test(src ?? '')

const stemOf = (p) => p.replace(/\.[a-z0-9]+$/i, '')

function toWebp(input, output, maxWidth) {
  mkdirSync(dirname(output), { recursive: true })
  if (/\.gif$/i.test(input)) {
    execFileSync('gif2webp', ['-quiet', '-q', '75', input, '-o', output])
    return
  }
  const resize =
    maxWidth && imageSize(input)[0] > maxWidth ? ['-resize', String(maxWidth), '0'] : []
  execFileSync('cwebp', ['-quiet', '-q', '75', ...resize, input, '-o', output])
}

function createResolver({ cache, media }) {
  const tmp = mkdtempSync(join(tmpdir(), 'lazy-images-'))
  const originals = new Map()
  const byBase = new Map()
  for (const { url } of manifest()) {
    const path = url.replace(/^https?:\/\/(?:www\.)?/, '')
    const stem = stemOf(path).replace(/-scaled$/, '')
    originals.set(stem, path)
    const base = stem.split('/').pop().toLowerCase()
    if (!byBase.has(base)) byBase.set(base, [])
    byBase.get(base).push(path)
  }
  const members = new Map()
  for (const zip of media) {
    const list = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 1 << 26 })
    for (const m of list.split('\n')) {
      const path = m.replace(/^media\//, '').replace(/^www\./, '')
      if (path && !m.endsWith('/')) members.set(path, { zip, member: m })
    }
  }
  const extract = (path) => {
    const hit = members.get(path)
    if (!hit) return null
    const out = join(tmp, path.replace(/\//g, '_'))
    writeFileSync(out, execFileSync('unzip', ['-p', hit.zip, hit.member], { maxBuffer: 1 << 30 }))
    return out
  }

  /** The archived original a derivative was made from, by host and stem. */
  const originalOf = (path) => {
    const host = path.split('/')[0]
    let stem = stemOf(path)
    if (stem.includes('/bfi_thumb/')) {
      const base = stem
        .split('/')
        .pop()
        .replace(/-[a-z0-9]{40,}$/, '')
        .toLowerCase()
      const hits = byBase.get(base) ?? []
      return hits.find((p) => p.startsWith(host + '/')) ?? hits[0] ?? null
    }
    stem = stem.replace(/-\d+x\d+$/, '').replace(/-scaled$/, '')
    return originals.get(stem) ?? null
  }

  const memo = new Map()
  return (path) => {
    if (memo.has(path)) return memo.get(path)
    let result = null
    const webp = stemOf(path) + '.webp'
    const original = originalOf(path)
    const cached = cache && join(cache, path)
    if (existsSync(join(ASSETS, path))) result = path
    else if (existsSync(join(ASSETS, webp))) result = webp
    else if (cached && existsSync(cached)) {
      const [w, h] = imageSize(cached)
      const out = original ? `${stemOf(original).replace(/-scaled$/, '')}-${w}x${h}.webp` : webp
      if (!existsSync(join(ASSETS, out))) toWebp(cached, join(ASSETS, out), 1600)
      result = out
    } else if (original) {
      const src = extract(original)
      if (src) {
        const tmpOut = join(tmp, 'resized.webp')
        toWebp(src, tmpOut, 800)
        const [w, h] = imageSize(tmpOut)
        const out = `${stemOf(original).replace(/-scaled$/, '')}-${w}x${h}.webp`
        if (!existsSync(join(ASSETS, out))) {
          mkdirSync(dirname(join(ASSETS, out)), { recursive: true })
          writeFileSync(join(ASSETS, out), readFileSync(tmpOut))
        }
        result = out
      }
    }
    memo.set(path, result)
    return result
  }
}

/** Rewrites one fragment's lazy images. `resolve` maps a target path to a served path or null. */
export function restoreLazyImages(html, slug, resolve, dims) {
  const unresolved = []
  const out = html.replace(LAZY_IMG, (tag, set) => {
    const src = tag.match(/\ssrc="([^"]*)"/)?.[1]
    if (!isPlaceholder(src)) return tag
    const target = lazyTarget(set, slug)
    if (!target) return tag
    const served = resolve(target)
    if (!served) {
      unresolved.push(target)
      return tag
    }
    const [w, h] = dims(served)
    let next = tag
      .replace(/\sdata-mk-image-src-set='[^']*'/, '')
      .replace(/\s(?:width|height|loading|decoding)="[^"]*"/g, '')
      .replace(/\ssrc="[^"]*"/, ` src="%%BASE%%/_ffc-assets/${served}"`)
    next = next.replace(
      /\s*\/?>$/,
      ` width="${w}" height="${h}" loading="lazy" decoding="async" />`
    )
    return next
  })
  return { html: out, unresolved }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const cache = args.includes('--cache') ? args[args.indexOf('--cache') + 1] : null
  const media = []
  for (
    let i = args.indexOf('--media') + 1;
    i > 0 && i < args.length && !args[i].startsWith('--');
    i++
  ) {
    media.push(args[i])
  }
  const resolve = createResolver({ cache, media })
  const dimsMemo = new Map()
  const dims = (p) => {
    if (!dimsMemo.has(p)) dimsMemo.set(p, imageSize(join(ASSETS, p)))
    return dimsMemo.get(p)
  }
  const unresolved = new Map()
  let files = 0
  for (const file of walk(CONTENT)) {
    const slug = file.slice(CONTENT.length + 1, -'.html'.length)
    const html = readFileSync(file, 'utf8')
    const result = restoreLazyImages(html, slug, resolve, dims)
    for (const t of result.unresolved) unresolved.set(t, (unresolved.get(t) ?? 0) + 1)
    if (result.html !== html) {
      writeFileSync(file, result.html)
      files++
    }
  }
  const previous = existsSync(UNRESOLVED) ? JSON.parse(readFileSync(UNRESOLVED, 'utf8')) : {}
  const list = Object.fromEntries(
    [...unresolved.keys()]
      .sort()
      .map((t) => [t, previous[t] ?? 'not in the live site or the media archive'])
  )
  if (unresolved.size || existsSync(UNRESOLVED)) {
    writeFileSync(UNRESOLVED, JSON.stringify(list, null, 2) + '\n')
  }
  console.log(`Restored lazy images in ${files} fragments; ${unresolved.size} targets unresolved.`)
}
