#!/usr/bin/env node
/**
 * Lists every media-library file the pages render, maps each to its original
 * in the live archive's media manifests (#41), and pins its sha256 in
 * `__tests__/assets/media-rendered.json`. The test of the same name fails when
 * a rendered file changes or appears without a pin.
 *
 * Run `node scripts/pin-rendered-media.mjs --write` after reviewing a change to
 * rendered media.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const ASSETS = join(ROOT, 'public', '_ffc-assets')
const ARCHIVE = join(ROOT, 'docs', 'live-archive', '2026-10-02')
export const PINS = join(ROOT, '__tests__', 'assets', 'media-rendered.json')

const UPLOAD_REF =
  /%%BASE%%\/_ffc-assets\/((?:i0\.wp\.com\/)?(?:[a-z]+\.)?newheightseducation\.org\/wp-content\/uploads\/[^"'\s?#),]+)/g

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

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
        .replace(/(__[^/]*)?\.[a-z0-9]+$/i, '')
        .replace(/-\d+x\d+$/, '')
        .replace(/-scaled$/, '')
    ) ?? null

  const paths = new Set()
  for (const file of walk(CONTENT)) {
    for (const [, path] of readFileSync(file, 'utf8').matchAll(UPLOAD_REF)) {
      if (existsSync(join(ASSETS, path))) paths.add(path)
    }
  }
  return new Map([...paths].sort().map((path) => [path, sourceOf(path)]))
}

if (process.argv.includes('--write')) {
  const pins = {}
  for (const [path, source] of renderedMedia()) {
    pins[path] = { sha256: sha256(join(ASSETS, path)), source }
  }
  writeFileSync(PINS, JSON.stringify(pins, null, 2) + '\n')
  console.log(`Pinned ${Object.keys(pins).length} rendered media files.`)
}
