#!/usr/bin/env node
/**
 * One-off (#59): writes a noindex meta-refresh page at each old WordPress URL
 * that the live site redirected to a page this site has, as TEP #60 did.
 * Targets are relative, so the stubs work at the github.io subpath and the apex.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, posix } from 'node:path'

const PUBLIC = join(import.meta.dirname, '..', 'public')

const EVENTS = [
  'prom',
  'recognition-day',
  'nheg-enrichment-day',
  'nheg-home-charter-school-graduation',
]
const BOOKS = ['unraveling-reading', 'one-nonprofits-journey-to-success']
const PROGRAMS = ['nheg-travel', 'nheg-tutoring-program']

/** Old path -> [new path, link text]. */
export const STUBS = {
  ...Object.fromEntries(
    Array.from({ length: 63 }, (_, i) => [`/page/${i + 2}/`, ['/', 'the home page']])
  ),
  '/cart/': ['/shop/', 'the NHEG store'],
  '/my-account/': ['/shop/', 'the NHEG store'],
  ...Object.fromEntries(
    EVENTS.map((s) => [`/parents/events/${s}/`, [`/events/${s}/`, 'this event']])
  ),
  ...Object.fromEntries(
    EVENTS.filter((s) => s !== 'recognition-day').map((s) => [
      `/nheg-parents/nheg-home-charter-school-events/${s}/`,
      [`/events/${s}/`, 'this event'],
    ])
  ),
  ...Object.fromEntries(
    BOOKS.map((s) => [`/who-we-are/books/${s}/`, [`/who-we-are/nheg-books/${s}/`, 'this book']])
  ),
  ...Object.fromEntries(
    PROGRAMS.map((s) => [
      `/nheg-programs/${s}/`,
      [`/nheg-educational-programs/${s}/`, 'this program'],
    ])
  ),
  '/nheg-news/nheg-recognition-day-2017/': [
    '/nheg-news/nheg-recognition-day-2017-event/',
    'this post',
  ],
  '/nheg-radio-show/': ['/category/nheg-radio-show/', 'the NHEG Radio Show'],
  '/feed/': ['/nheg-blog/', 'the NHEG blog'],
}

/** `to` relative to the directory `from` is served at. */
export function relativeTarget(from, to) {
  const rel = posix.relative(from, to)
  return rel ? `${rel}/` : './'
}

export function stubHtml(from, [to, label]) {
  const href = relativeTarget(from, to)
  return `<!doctype html>
<html lang="en-US">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${href}" />
    <title>Page moved | New Heights Educational Group</title>
  </head>
  <body>
    <p>This page has moved to <a href="${href}">${label}</a>.</p>
  </body>
</html>
`
}

if (process.argv[1] === import.meta.filename) {
  for (const [from, target] of Object.entries(STUBS)) {
    const dir = join(PUBLIC, from)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), stubHtml(from, target))
  }
  console.log(`wrote ${Object.keys(STUBS).length} stubs`)
}
