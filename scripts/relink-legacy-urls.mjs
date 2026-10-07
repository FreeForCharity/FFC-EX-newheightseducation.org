#!/usr/bin/env node
/**
 * One-off (#59): points links at old newheightseducation.org URLs where the
 * live site's own redirects sent them, so they keep working after the
 * WordPress host goes. Uploads go to the copy in `public/_ffc-assets`, or to
 * the GitHub release that holds the newsletters too large for Pages.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CONTENT = join(ROOT, 'src', 'clone-content')
const ASSETS = join(ROOT, 'public', '_ffc-assets', 'newheightseducation.org')
const NEWSLETTERS = join(ROOT, 'docs', 'live-archive', '2026-10-02', 'newsletters.json')

export const SERVICE_FEES =
  'https://nheg.givebacks.com/store?category=NHEG%20Program%20and%20Service%20Fees'

const EVENTS = [
  'prom',
  'recognition-day',
  'nheg-enrichment-day',
  'nheg-home-charter-school-graduation',
]

export const PATHS = {
  '/nheg-radio-show': '/category/nheg-radio-show/',
  '/nheg-radio-show/': '/category/nheg-radio-show/',
  '/animation-course/': '/school/online-courses/animation-course/',
  '/nheg-news/nheg-recognition-day-2017/': '/nheg-news/nheg-recognition-day-2017-event/',
  '/who-we-are/books/unraveling-reading/': '/who-we-are/nheg-books/unraveling-reading/',
  '/who-we-are/books/one-nonprofits-journey-to-success/':
    '/who-we-are/nheg-books/one-nonprofits-journey-to-success/',
  '/who-we-are/nheg-groups/veterans-and-emergency-responders-support/':
    '/school/about/nheg-groups/veterans-and-emergency-responders-support/',
  '/nheg-programs/nheg-travel/': '/nheg-educational-programs/nheg-travel/',
  '/nheg-programs/nheg-tutoring-program/': '/nheg-educational-programs/nheg-tutoring-program/',
  ...Object.fromEntries(EVENTS.map((slug) => [`/parents/events/${slug}/`, `/events/${slug}/`])),
  ...Object.fromEntries(
    EVENTS.map((slug) => [
      `/nheg-parents/nheg-home-charter-school-events/${slug}/`,
      `/events/${slug}/`,
    ])
  ),
}

export const CASE_ONLY = [
  '/nheg-educational-programs/virtual-reading-program/',
  '/volunteer-with-nheg/nheg-volunteer-opportunities/',
  '/nheg-educational-programs/nheg-tutoring-program/',
  '/who-we-are/nheg-edguide/',
]

const newsletters = new Map(
  JSON.parse(readFileSync(NEWSLETTERS, 'utf8')).map((n) => [n.path, n.url])
)

/** Where an old site path now lives, or null to leave the link as it is. */
export function targetOf(path, hasAsset = (p) => existsSync(join(ASSETS, p))) {
  if (path === '/nheg-educational-programs/program-service-fees/') return SERVICE_FEES
  if (path.startsWith('/wp-content/')) {
    if (newsletters.has(path)) return newsletters.get(path)
    return hasAsset(path) ? `%%BASE%%/_ffc-assets/newheightseducation.org${path}` : null
  }
  if (PATHS[path]) return `%%BASE%%${PATHS[path]}`
  if (path !== path.toLowerCase() && CASE_ONLY.includes(path.toLowerCase())) {
    return `%%BASE%%${path.toLowerCase()}`
  }
  return null
}

const ABSOLUTE = /href="https?:\/\/(?:www\.)?newheightseducation\.org(\/[^"]*)"/gi
const RELATIVE = /href="%%BASE%%(\/(?:nheg-programs|nheg-parents|who-we-are\/books)\/[^"]*)"/g

export function relink(html, hasAsset) {
  const swap = (whole, path) => {
    const to = targetOf(path, hasAsset)
    return to ? `href="${to}"` : whole
  }
  return html.replace(ABSOLUTE, swap).replace(RELATIVE, swap)
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = relink(html)
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`relinked ${pages} pages`)
}
