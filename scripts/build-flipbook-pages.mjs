#!/usr/bin/env node
/**
 * Renders each publication issue's PDF into the page images the flipbook
 * viewer shows, and records them in src/data/flipbook-pages.json.
 *
 * Page images are too big for the Pages site (it is near its 1 GB limit), so
 * they live on the `flipbook-pages` branch, which shares no history with main
 * and is never built. The viewer loads them from jsDelivr pinned to that
 * branch's commit (raw.githubusercontent.com as a fallback); both send
 * Access-Control-Allow-Origin: *, which WebGL textures need.
 *
 * Two-page spreads in the PDF become two pages, so the viewer's page count
 * matches the printed magazine. Each page gets three sizes:
 *   NNN-lo.webp  800 px tall, shown normally
 *   NNN-hi.webp 1200 px tall, loaded when zoomed in
 *   NNN-th.webp  200 px tall, for the thumbnails panel
 *
 * Needs pdftoppm (poppler-utils) and cwebp (webp).
 *
 * Run: node scripts/build-flipbook-pages.mjs <out-dir> [slug ...]
 *   <out-dir> is a checkout of the flipbook-pages branch; one folder per slug.
 *   Issues already in <out-dir> with a matching source hash are skipped.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const ARCHIVE = join(ROOT, 'docs/live-archive/2026-10-02')
const SIZES = { lo: 800, hi: 1200, th: 200 }
const QUALITY = { lo: 78, hi: 78, th: 65 }

/** Every issue with a PDF: { slug, source } where source is a local path or a URL. */
export function issues() {
  const sources = JSON.parse(readFileSync(join(ARCHIVE, 'dflip-sources.json'), 'utf8'))
  const assets = new Map(
    JSON.parse(readFileSync(join(ARCHIVE, 'publications-pdfs.json'), 'utf8')).map((a) => [
      a.page,
      a,
    ])
  )
  const added = JSON.parse(readFileSync(join(ROOT, 'src/data/publication-issues.json'), 'utf8'))
  const slugOf = (page) => new URL(page).pathname.replace(/^\/books\/|\/$/g, '')
  const out = []
  for (const s of sources) {
    if (!s.source) continue
    const local = s.local && join(ROOT, 'public', s.local)
    out.push({
      slug: slugOf(s.page),
      ...(local && existsSync(local)
        ? { source: local } // the copy the site serves, hashed when read
        : { source: assetFor(assets, s.page), sha256: s.sha256 }),
    })
  }
  for (const a of added) out.push({ slug: a.slug, source: a.url, sha256: a.sha256 })
  return out
}
const assetFor = (assets, page) => {
  const a = assets.get(page)
  if (!a) throw new Error(`no released PDF for ${page}`)
  return a.url
}

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString()

/** Width and height of a PNG, from its header. */
function pngSize(file) {
  const b = readFileSync(file)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

function fetchPdf(source, dir) {
  if (!/^https?:/.test(source)) return source
  const file = join(dir, 'source.pdf')
  run('curl', ['-sSfL', '--retry', '3', '-o', file, source])
  return file
}

/** Renders one issue into <out>/<slug>/. Returns its manifest entry. */
export function buildIssue({ slug, source, sha256 }, outRoot) {
  const out = join(outRoot, slug)
  const stamp = join(out, 'source.sha256')
  sha256 ??= /^https?:/.test(source)
    ? undefined
    : createHash('sha256').update(readFileSync(source)).digest('hex')
  if (sha256 && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === sha256) {
    return JSON.parse(readFileSync(join(out, 'pages.json'), 'utf8'))
  }
  const tmp = mkdtempSync(join(tmpdir(), `flip-${slug}-`))
  try {
    const pdf = fetchPdf(source, tmp)
    const got = createHash('sha256').update(readFileSync(pdf)).digest('hex')
    if (sha256 && got !== sha256) throw new Error(`${slug}: PDF hash ${got} is not ${sha256}`)
    // Render at the zoom size: every page HI px tall, width to match.
    run('pdftoppm', [
      '-png',
      '-scale-to-y',
      String(SIZES.hi),
      '-scale-to-x',
      '-1',
      pdf,
      join(tmp, 'r'),
    ])
    const renders = readdirSync(tmp)
      .filter((f) => /^r-\d+\.png$/.test(f))
      .sort()
    rmSync(out, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    let n = 0
    let aspect = null
    for (const f of renders) {
      const file = join(tmp, f)
      const [w, h] = pngSize(file)
      // A page wider than tall is a two-page spread: split it down the middle.
      const halves =
        w > h
          ? [
              [0, Math.floor(w / 2)],
              [Math.floor(w / 2), w - Math.floor(w / 2)],
            ]
          : [[0, w]]
      for (const [x, cw] of halves) {
        n++
        aspect ??= cw / h
        const name = String(n).padStart(3, '0')
        for (const [size, px] of Object.entries(SIZES)) {
          const args = [
            '-quiet',
            '-q',
            String(QUALITY[size]),
            '-m',
            '5',
            '-crop',
            String(x),
            '0',
            String(cw),
            String(h),
          ]
          if (px !== h) args.push('-resize', '0', String(px))
          run('cwebp', [...args, file, '-o', join(out, `${name}-${size}.webp`)])
        }
      }
    }
    const entry = { pages: n, aspect: Math.round(aspect * 10000) / 10000 }
    writeFileSync(join(out, 'pages.json'), JSON.stringify(entry) + '\n')
    writeFileSync(stamp, (sha256 ?? got) + '\n')
    return entry
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outRoot, ...only] = process.argv.slice(2)
  if (!outRoot) {
    console.error('usage: build-flipbook-pages.mjs <out-dir> [slug ...]')
    process.exit(1)
  }
  const list = issues().filter((i) => !only.length || only.includes(i.slug))
  const manifest = {}
  for (const [k, i] of list.entries()) {
    const t = Date.now()
    manifest[i.slug] = buildIssue(i, outRoot)
    console.log(
      `${k + 1}/${list.length} ${i.slug}: ${manifest[i.slug].pages} pages, ${((Date.now() - t) / 1000).toFixed(0)}s`
    )
  }
  // Index every issue in the folder, so building one issue keeps the others.
  for (const d of readdirSync(outRoot)) {
    const f = join(outRoot, d, 'pages.json')
    if (!manifest[d] && existsSync(f)) manifest[d] = JSON.parse(readFileSync(f, 'utf8'))
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(join(outRoot, 'index.json'), JSON.stringify(sorted, null, 1) + '\n')
}
