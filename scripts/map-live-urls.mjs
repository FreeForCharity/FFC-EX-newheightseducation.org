#!/usr/bin/env node
/**
 * Maps every page the four live hosts served on 2026-10-02 to where it lives
 * now, and checks the page's words, images and PDFs came with it (#59).
 * Writes docs/cutover/url-map.csv.
 *
 *   gh release download live-archive-2026-10-02 -p live-html-2026-10-02.zip
 *   unzip live-html-2026-10-02.zip -d <dir>
 *   node scripts/map-live-urls.mjs --archive <dir>/html
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STUBS } from './write-legacy-stubs.mjs'

const ROOT = join(import.meta.dirname, '..')

/** Old newsletter file names -> the names they were released under. */
const RENAMED = new Map(
  JSON.parse(
    readFileSync(join(ROOT, 'docs', 'live-archive', '2026-10-02', 'newsletters.json'), 'utf8')
  ).map((e) => [e.path.split('/').pop().toLowerCase(), e.asset.toLowerCase()])
)

export const HOSTS = {
  'newheightseducation.org': '',
  'school.newheightseducation.org': '/school',
  'publications.newheightseducation.org': '/publications',
  'radio.newheightseducation.org': '/radio',
}

/** Words of features removed on purpose: share buttons, comments, forms, cart, password prompts. */
export const REMOVED_WORDS = new Set(
  (
    'via share linkedin facebook pinterest feed networks mix email print copy link copied twitter company order your address will not published ' +
    'required fields are marked type here name website save and browser the time comment comments ' +
    'reply cancel must logged post leave first last details let know how get back feel free ask ' +
    'question simply questions submit consent collecting contacting about choose option options select ' +
    'clear quantity add cart sizes default sorting sort popularity average rating latest price low high ' +
    'page content view below protected password verify access url registration join fill out receive ' +
    "zoom note check spam folder don't see inbox enrollment along once received one members talk further"
  ).split(' ')
)

/** Images a ruling removed: PayPal buttons (#55) and tracking pixels. */
const REMOVED_ASSETS = new Set(['btn_buynowcc_lg', 'pixel'])

/** The path an old URL lands on here, and how. */
export function mapUrl(url, stubs = STUBS) {
  const { host, pathname } = new URL(url)
  const path = `${HOSTS[host]}${decodeURIComponent(pathname)}`
  if (path in stubs) return { path: stubs[path][0], how: 'stub' }
  return { path, how: HOSTS[host] ? 'prefix' : 'same path' }
}

/** The clone-content name a route renders, or null if it is not a page. */
export function contentNameFor(route, root = ROOT) {
  const rel = route.replace(/^\/|\/$/g, '') || 'index'
  if (existsSync(join(root, 'src', 'clone-content', `${rel}.html`))) return rel
  const page = join(root, 'src', 'app', rel === 'index' ? '' : rel, 'page.tsx')
  if (!existsSync(page)) return null
  return /loadCloneContent\('([^']+)'\)/.exec(readFileSync(page, 'utf8'))?.[1] ?? ''
}

const stripTags = (html) =>
  html
    // Forms became email links (#53) and the store lost its option pickers (#54).
    .replace(/<(head|title|script|style|noscript|svg|form|select)\b[\s\S]*?<\/\1>/gi, ' ')
    // The dead Twitter feed (#45) and schema.org metadata nobody sees.
    // Spreaker links became players; leftover shortcodes and bare URLs aren't content.
    .replace(/<a class="spreaker-player"[^>]*>[^<]*<\/a>/gi, ' ')
    .replace(/\[[a-z_]+ [^\]]*\]|https?:\/\/[^\s<"]+/gi, ' ')
    .replace(/<a [^>]*class="tweet-time"[\s\S]*?<\/a>|<span itemprop="[^"]*">[^<]*<\/span>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#\w]+;/g, ' ')

/** Each word and how many times it appears. */
export function words(html) {
  const counts = new Map()
  for (const w of stripTags(html)
    .toLowerCase()
    .match(/[a-z0-9']{3,}/g) ?? [])
    counts.set(w, (counts.get(w) ?? 0) + 1)
  return counts
}

/** File names, ignoring WordPress size suffixes and image format. */
export function assets(html) {
  const stems = new Set()
  // Empty lightbox anchors show nothing.
  const visible = html.replace(/<a\s[^>]*>(?:&nbsp;|\s)*<\/a>/gi, ' ')
  for (const [, url] of visible.matchAll(
    /(?<![.\w])(?:src|href|data-src)=["']([^"']+\.(?:jpe?g|png|gif|webp|pdf|docx?|pptx?|xlsx?|xlsm|zip))["']/gi
  )) {
    const name = decodeURIComponent(url.split('/').pop()).toLowerCase()
    const file = RENAMED.get(name) ?? name
    const image = /\.(?:jpe?g|png|gif|webp)$/.test(file)
    const stem = image
      ? file
          .replace(/\.\w+$/, '')
          .replace(/-\d+x\d+$/, '')
          .replace(/-scaled$/, '')
      : file
    if (!stem.startsWith('dummy-transparent')) stems.add(stem)
  }
  return stems
}

/** Items on most of a host's pages: header, menus, footer. */
export function boilerplate(sets, share = 0.5) {
  const counts = new Map()
  for (const set of sets)
    for (const item of set.keys()) counts.set(item, (counts.get(item) ?? 0) + 1)
  return new Set([...counts].filter(([, n]) => n > sets.length * share).map(([item]) => item))
}

/** What of a live page's own content the export is missing. */
export function compare(live, exported, common) {
  const words = [...live.words]
    .filter(
      ([w, n]) => !common.words.has(w) && !REMOVED_WORDS.has(w) && (exported.words.get(w) ?? 0) < n
    )
    .map(([w]) => w)
  const files = [...live.assets].filter(
    (a) => !common.assets.has(a) && !exported.assets.has(a) && !REMOVED_ASSETS.has(a)
  )
  return { words, files }
}

/** The content_check cell: 'ok', or what a person should look at. */
export function verdict({ words, files }, path) {
  // Product option pictures went with the option pickers (#54).
  const lost = path.startsWith('/product/') ? [] : files
  if (!words.length && !lost.length) return 'ok'
  return [
    'CHECK',
    words.length && `words: ${words.join(' ')}`,
    lost.length && `files: ${lost.join(' ')}`,
  ]
    .filter(Boolean)
    .join('; ')
}

const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

if (process.argv[1] === import.meta.filename) {
  const archive = process.argv[process.argv.indexOf('--archive') + 1]
  if (!process.argv.includes('--archive') || !existsSync(archive)) {
    console.error('usage: node scripts/map-live-urls.mjs --archive <unzipped html dir>')
    process.exit(2)
  }

  const rows = []
  let unmapped = 0
  let flagged = 0
  for (const host of Object.keys(HOSTS)) {
    const pages = JSON.parse(readFileSync(join(archive, `${host}.json`), 'utf8'))
      .filter((p) => p.status === 200)
      .map((p) => {
        const dir = decodeURIComponent(new URL(p.url).pathname)
        const file = [
          join(archive, host, dir, 'index.html'),
          join(archive, host, new URL(p.url).pathname, 'index.html'),
        ].find(existsSync)
        const html = file ? readFileSync(file, 'utf8') : ''
        return { url: p.url, archived: !!file, live: { words: words(html), assets: assets(html) } }
      })
    const common = {
      words: boilerplate(pages.map((p) => p.live.words)),
      assets: boilerplate(pages.map((p) => p.live.assets)),
    }

    for (const { url, archived, live } of pages) {
      const { path, how } = mapUrl(url)
      const name = contentNameFor(path)
      let check
      if (!archived) {
        flagged++
        check = 'NO ARCHIVED COPY'
      } else if (name === null) {
        unmapped++
        check = 'NOT FOUND'
      } else if (how === 'stub' || !name) {
        check = how === 'stub' ? 'redirect' : 'app page'
      } else {
        const html = readFileSync(join(ROOT, 'src', 'clone-content', `${name}.html`), 'utf8')
        check = verdict(compare(live, { words: words(html), assets: assets(html) }, common), path)
        if (check !== 'ok') flagged++
      }
      rows.push([url, path, how, check])
    }
  }

  const csv = [['old_url', 'new_path', 'how', 'content_check'], ...rows]
    .map((r) => r.map(csvCell).join(','))
    .join('\n')
  writeFileSync(join(ROOT, 'docs', 'cutover', 'url-map.csv'), `${csv}\n`)
  console.log(`${rows.length} live pages, ${unmapped} not found, ${flagged} to check`)
  for (const r of rows.filter((r) => r[3] !== 'ok' && !['redirect', 'app page'].includes(r[3])))
    console.log(`${r[1]}  ${r[3]}`)
  process.exitCode = unmapped || flagged ? 1 : 0
}
