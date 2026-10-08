#!/usr/bin/env node
/**
 * Converts the JPEG and PNG files left under public/_ffc-assets, the theme's
 * hero backgrounds and the header logo to WebP, keeps
 * each twin only when it is smaller, points every page and stylesheet at it,
 * and deletes originals nothing references. Needs libwebp's `cwebp`. Then run
 * `node scripts/pin-rendered-media.mjs --write`.
 *
 *   node scripts/webp-remaining-images.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const ASSETS = join(ROOT, 'public', '_ffc-assets')
const ROOTS = [
  [ASSETS, ASSETS],
  [join(ROOT, 'src', 'app', 'theme-backgrounds'), join(ROOT, 'src', 'app')],
  [join(ROOT, 'public', 'Images'), join(ROOT, 'public')],
]
const KEEP = new Set(['Images/og-image.png'])
const SOURCES = [
  join(ROOT, 'src', 'clone-content'),
  join(ROOT, 'public', '_ffc-css'),
  join(ROOT, 'public', '_ffc-assets'),
  join(ROOT, 'src', 'app'),
  join(ROOT, 'src', 'components'),
]
const TEXT = /\.(html|css|tsx?|json)$/

const walk = (dir, keep) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), keep) : keep(e.name) ? [join(dir, e.name)] : []
  )

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Points `ref`-relative paths at their WebP twin. `map` is original path to twin path. */
export function rewrite(text, map) {
  if (!map.size) return text
  const re = new RegExp(`(${[...map.keys()].map(escapeRe).join('|')})(?=["'\\s?#),]|$)`, 'g')
  return text.replace(re, (path) => map.get(path))
}

if (process.argv[1] === import.meta.filename) {
  const map = new Map()
  const bases = new Map()
  const files = ROOTS.flatMap(([dir, base]) =>
    walk(dir, (n) => /\.(jpe?g|png)$/i.test(n)).map((file) => [file, base])
  )
  for (const [file, base] of files) {
    if (KEEP.has(relative(base, file))) continue
    const twin = file.replace(/\.(jpe?g|png)$/i, '.webp')
    if (existsSync(twin)) continue
    const png = /\.png$/i.test(file)
    try {
      execFileSync(
        'cwebp',
        [
          '-quiet',
          '-mt',
          '-q',
          png ? '90' : '80',
          ...(png ? ['-alpha_q', '100'] : []),
          file,
          '-o',
          twin,
        ],
        { stdio: 'ignore' }
      )
    } catch {
      console.warn(`skipped ${relative(base, file)}: cwebp cannot read it`)
      continue
    }
    if (statSync(twin).size >= statSync(file).size) {
      unlinkSync(twin)
      continue
    }
    map.set(relative(base, file), relative(base, twin))
    bases.set(relative(base, file), base)
  }
  const texts = SOURCES.filter(existsSync).flatMap((dir) => walk(dir, (n) => TEXT.test(n)))
  let edited = 0
  for (const file of texts) {
    const text = readFileSync(file, 'utf8')
    const next = rewrite(text, map)
    if (next !== text) {
      writeFileSync(file, next)
      edited++
    }
  }
  const everything = texts.map((f) => readFileSync(f, 'utf8')).join('\n')
  let removed = 0
  for (const original of map.keys()) {
    if (everything.includes(original)) continue
    unlinkSync(join(bases.get(original), original))
    removed++
  }
  console.log(`${map.size} images to WebP, ${edited} files repointed, ${removed} originals removed`)
}
