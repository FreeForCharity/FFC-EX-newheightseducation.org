#!/usr/bin/env node
/**
 * Removes the "NHEG Twitter Feed" sidebar widget (#57). Twitter's old API
 * stopped answering, so on the live site it already showed one empty tweet
 * dated "57 years ago" linking to `twitter.com//statuses/`. Safe to re-run.
 *
 *   node scripts/remove-dead-twitter-feed.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')

export const DEAD_FEED =
  /<section id="twitter-\d+" class="widget widget_twitter">(?:(?!<\/section>)[^])*twitter\.com\/\/statuses\/(?:(?!<\/section>)[^])*<\/section>/g

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []
  )

if (process.argv[1] === import.meta.filename) {
  let pages = 0
  for (const file of walk(CONTENT)) {
    const html = readFileSync(file, 'utf8')
    const next = html.replace(DEAD_FEED, '')
    if (next !== html) {
      writeFileSync(file, next)
      pages++
    }
  }
  console.log(`Removed the dead Twitter feed from ${pages} pages.`)
}
