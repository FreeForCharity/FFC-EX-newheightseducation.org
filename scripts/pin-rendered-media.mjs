#!/usr/bin/env node
/**
 * Lists every media-library file the pages render, directly, through the
 * stylesheets they load, or as a section hero background in
 * `src/app/theme-layout.css`. Maps each to its original in the live archive's
 * media manifests (#41), and pins its sha256 in
 * `__tests__/assets/media-rendered.json`. The test of the same name fails when
 * a rendered file changes or appears without a pin.
 *
 * Run `node scripts/pin-rendered-media.mjs --write` after reviewing a change to
 * rendered media.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const ASSETS = join(ROOT, 'public', '_ffc-assets')
const ARCHIVE = join(ROOT, 'docs', 'live-archive', '2026-10-02')
const THEME_CSS = join(ROOT, 'src', 'app', 'theme-layout.css')
const HERO_PREFIX = 'theme-backgrounds/'
export const PINS = join(ROOT, '__tests__', 'assets', 'media-rendered.json')

const UPLOAD_REF =
  /%%BASE%%\/_ffc-assets\/((?:i0\.wp\.com\/)?(?:[a-z]+\.)?newheightseducation\.org\/wp-content\/uploads\/[^"'\s?#),]+)/g

const UPLOAD_PATH =
  /^(?:i0\.wp\.com\/)?(?:[a-z]+\.)?newheightseducation\.org\/wp-content\/uploads\//
const STYLESHEET_REF = /%%BASE%%\/(_ffc-(?:assets|css)\/[^"'\s?#]+\.css)/g
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/gi

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

/** Where a pinned path lives: hero backgrounds under src/app, the rest under _ffc-assets. */
export const fileOf = (path) =>
  path.startsWith(HERO_PREFIX) ? join(ROOT, 'src', 'app', path) : join(ASSETS, path)

export const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

export function manifest() {
  return readdirSync(ARCHIVE)
    .filter((f) => f.startsWith('media-manifest.'))
    .flatMap((f) => JSON.parse(readFileSync(join(ARCHIVE, f), 'utf8')))
}

/** Served path -> archive URL of the original it was derived from, or null. */
export function renderedMedia() {
  const byStem = new Map()
  for (const { url } of manifest()) {
    const stem = url
      .replace(/^https?:\/\//, '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/-scaled$/, '')
    byStem.set(stem, url)
  }
  const sourceOf = (path) =>
    byStem.get(
      path
        .replace(/^i0\.wp\.com\//, '')
        .replace(/^theme-backgrounds\/school\//, 'school.newheightseducation.org/')
        .replace(/^theme-backgrounds\//, 'newheightseducation.org/')
        .replace(/(__[^/]*)?\.[a-z0-9]+$/i, '')
        .replace(/-\d+x\d+$/, '')
        .replace(/-scaled$/, '')
    ) ?? null

  const paths = new Set()
  const stylesheets = new Set()
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    for (const [, path] of html.matchAll(UPLOAD_REF)) {
      if (existsSync(join(ASSETS, path))) paths.add(path)
    }
    for (const [, sheet] of html.matchAll(STYLESHEET_REF)) stylesheets.add(sheet)
  }
  for (const sheet of stylesheets) {
    const file = join(ROOT, 'public', sheet)
    if (!existsSync(file)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(CSS_URL)) {
      const ref = (m[1] ?? m[2] ?? m[3]).trim().split(/[?#]/)[0]
      if (!ref || /^(data:|https?:|\/)/i.test(ref)) continue
      const path = relative(ASSETS, resolve(dirname(file), ref))
        .split('\\')
        .join('/')
      if (UPLOAD_PATH.test(path) && existsSync(join(ASSETS, path))) paths.add(path)
    }
  }
  for (const m of readFileSync(THEME_CSS, 'utf8').matchAll(CSS_URL)) {
    const ref = (m[1] ?? m[2] ?? m[3]).trim().replace(/^\.\//, '')
    if (ref.startsWith(HERO_PREFIX)) paths.add(ref)
  }
  return new Map([...paths].sort().map((path) => [path, sourceOf(path)]))
}

if (process.argv.includes('--write')) {
  const pins = {}
  for (const [path, source] of renderedMedia()) {
    pins[path] = { sha256: sha256(fileOf(path)), source }
  }
  writeFileSync(PINS, JSON.stringify(pins, null, 2) + '\n')
  console.log(`Pinned ${Object.keys(pins).length} rendered media files.`)
}
