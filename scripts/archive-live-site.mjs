#!/usr/bin/env node
/**
 * Saves what the migration still needs from the four live WordPress hosts
 * before Bluehost hosting lapses (#41). Read-only against the live site.
 *
 * Small JSON maps go to --data (committed). Everything large goes to --out
 * and is published as release assets: the rendered HTML of every page,
 * including each archive's /page/N/ pages, the wp-json pages and posts, and
 * the media library originals.
 *
 * Run: node scripts/archive-live-site.mjs --data docs/live-archive/2026-10-02 --out <dir>
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'

export const HOSTS = [
  'newheightseducation.org',
  'school.newheightseducation.org',
  'publications.newheightseducation.org',
  'radio.newheightseducation.org',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Bluehost answers 409 with a cookie challenge once a client sends too many
// requests. Requests are spaced out, and a 409 waits for the limit to clear.
const GAP_MS = Number(process.env.ARCHIVE_GAP_MS || 0)

async function get(url, tries = 3) {
  for (let i = 1, limited = 0; ; i++) {
    try {
      if (GAP_MS) await sleep(GAP_MS)
      const res = await fetch(url, { headers: { 'user-agent': 'FFC-archive/1.0' } })
      if (res.status === 409 && limited < 10) {
        limited++
        i--
        console.error(`409, waiting before ${url}`)
        await sleep(60000 * limited)
        continue
      }
      if (res.status >= 500 && i < tries) throw new Error(`${res.status}`)
      return res
    } catch (err) {
      if (i >= tries) throw err
      await sleep(1000 * i)
    }
  }
}

async function json(url, tries = 3) {
  for (let i = 1; ; i++) {
    const res = await get(url)
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    try {
      const body = JSON.parse(await res.text())
      return { body, total: Number(res.headers.get('x-wp-totalpages') || 1) }
    } catch (err) {
      if (i >= tries) throw new Error(`${err.message}: ${url}`)
    }
  }
}

async function allPages(base, perPage = 100) {
  const items = []
  for (let page = 1; ; page++) {
    const sep = base.includes('?') ? '&' : '?'
    const { body, total } = await json(`${base}${sep}per_page=${perPage}&page=${page}`)
    items.push(...body)
    if (page >= total) return items
  }
}

async function pool(items, size, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i], i)
      }
    })
  )
  return results
}

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

const writeJson = (path, data) => write(path, JSON.stringify(data, null, 2) + '\n')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const decode = (s) =>
  s
    .replace(/&#0?39;|&#8217;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0?38;|&amp;/g, '&')

const text = (html) =>
  decode(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? decode(m[1] ?? m[2] ?? m[3]) : undefined
}

async function sitemapUrls(host) {
  const res = await get(`https://${host}/sitemap_index.xml`)
  if (!res.ok) return []
  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]).trim())
  const urls = []
  for (const map of locs(await res.text())) {
    const child = await get(map.replace(/^http:/, 'https:'))
    if (child.ok) urls.push(...locs(await child.text()))
  }
  return urls
}

/** Every public page and post URL: the Yoast sitemap plus wp-json, since school has no sitemap. */
export async function pageUrls(host) {
  const fromApi = []
  for (const type of ['pages', 'posts']) {
    const items = await allPages(`https://${host}/wp-json/wp/v2/${type}?_fields=link`)
    fromApi.push(...items.map((i) => i.link))
  }
  const all = [...(await sitemapUrls(host)), ...fromApi].map((u) =>
    u.replace(/^http:/, 'https:').replace(/#.*$/, '')
  )
  return [...new Set(all)].filter((u) => new URL(u).host === host).sort()
}

const htmlPath = (url) => {
  const { host, pathname } = new URL(url)
  return join('html', host, pathname.replace(/\/?$/, '/'), 'index.html')
}

/**
 * How many pages an archive has: Jupiter's `data-max-pages`, or the highest
 * `/page/N/` the page links to. WordPress answers 200 for `/page/N/` on any
 * page, so probing until a 404 would never stop.
 */
export function pageCount(url, html) {
  const base = url.replace(/\/?$/, '/')
  const counts = [1]
  for (const m of html.matchAll(/data-max-pages="(\d+)"/g)) counts.push(Number(m[1]))
  for (const m of html.matchAll(/href="([^"]+)\/page\/(\d+)\/?"/g)) {
    if (`${decode(m[1])}/` === base) counts.push(Number(m[2]))
  }
  return Math.max(...counts)
}

async function paginated(url, html) {
  const pages = []
  for (let n = 2; n <= pageCount(url, html); n++) {
    const pageUrl = `${url.replace(/\/?$/, '/')}page/${n}/`
    const res = await get(pageUrl)
    if (res.ok) pages.push({ url: pageUrl, html: await res.text() })
  }
  return pages
}

/** dFlip books: the inline `df_option_<id>` object whose `source` is the PDF. */
export function dflipSources(html) {
  const books = []
  for (const m of html.matchAll(/(?:var\s+|window\.)(df_option_\d+)\s*=\s*(\{[\s\S]*?\});/g)) {
    try {
      const option = JSON.parse(m[2])
      if (option.source) books.push({ option: m[1], source: option.source })
    } catch {
      books.push({ option: m[1], unparsed: m[2].slice(0, 500) })
    }
  }
  return books
}

/** Each <form>'s action, identity and fields, with the label text a visitor sees. */
export function formsIn(html) {
  const forms = []
  for (const m of html.matchAll(/(<form\b[^>]*>)([\s\S]*?)<\/form>/gi)) {
    const [, open, body] = m
    const labels = new Map()
    for (const l of body.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
      const forId = attr(`<label ${l[1]}>`, 'for')
      if (forId) labels.set(forId, text(l[2]).replace(/\s*\*$/, ''))
    }
    const fields = []
    for (const f of body.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
      const tag = f[0]
      const type = f[1].toLowerCase() === 'input' ? attr(tag, 'type') || 'text' : f[1].toLowerCase()
      if (['hidden', 'submit', 'button'].includes(type)) continue
      const id = attr(tag, 'id')
      const field = {
        name: attr(tag, 'name'),
        type,
        label: (id && labels.get(id)) || attr(tag, 'placeholder') || attr(tag, 'aria-label'),
        required: /\srequired\b|aria-required="true"|data-parsley-required/i.test(tag),
      }
      if (type === 'select') {
        const end = body.indexOf('</select>', f.index)
        field.options = [
          ...body.slice(f.index, end).matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi),
        ]
          .map((o) => text(o[1]))
          .filter(Boolean)
      }
      if (type === 'checkbox' || type === 'radio') field.value = attr(tag, 'value')
      fields.push(field)
    }
    const submit = body.match(
      /<(?:input|button)\b[^>]*type="submit"[^>]*>(?:([\s\S]*?)<\/button>)?/i
    )
    forms.push({
      id: attr(open, 'data-form-id') || attr(open, 'id'),
      class: attr(open, 'class'),
      action: attr(open, 'action'),
      method: (attr(open, 'method') || 'get').toLowerCase(),
      fields,
      submit: submit ? text(submit[1] || '') || attr(submit[0], 'value') : undefined,
    })
  }
  return forms
}

// A Caldera form keeps its `CF...` id on every page it is embedded in, while
// its field names carry a per-instance suffix.
const formKey = (form) =>
  /^CF[0-9a-f]+$/.test(form.id || '')
    ? form.id
    : `${form.id || ''}|${form.action || ''}|${form.fields.map((f) => f.name).join(',')}`

export async function crawl(host, out) {
  const index = join(out, 'html', `${host}.json`)
  const saved = existsSync(index) ? JSON.parse(readFileSync(index, 'utf8')) : []
  const done = new Map(saved.filter((p) => p.status === 200).map((p) => [p.url, p]))
  const pages = [...done.values()].map((p) => ({
    ...p,
    html: readFileSync(join(out, htmlPath(p.url)), 'utf8'),
  }))
  // Reuse what was saved, but retry anything that failed last time.
  const urls = saved.length
    ? saved.filter((p) => !done.has(p.url) && !/\/page\/\d+\/$/.test(p.url)).map((p) => p.url)
    : await pageUrls(host)
  await pool(urls, Number(process.env.ARCHIVE_POOL || 6), async (url) => {
    const res = await get(url)
    const html = await res.text()
    pages.push({ url, status: res.status, html })
    for (const p of await paginated(url, html)) pages.push({ ...p, status: 200 })
  })
  pages.sort((a, b) => a.url.localeCompare(b.url))
  for (const p of pages) write(join(out, htmlPath(p.url)), p.html)
  writeJson(
    index,
    pages.map(({ url, status }) => ({ url, status }))
  )
  console.log(`${host}: crawled ${pages.length} pages`)
  return pages
}

async function media(host, out) {
  const items = await allPages(
    `https://${host}/wp-json/wp/v2/media?_fields=id,date,slug,title,mime_type,source_url,media_details,post`
  )
  const files = []
  for (const item of items) {
    const original = item.media_details?.original_image
    const urls = [item.source_url]
    if (original) urls.push(item.source_url.replace(/[^/]+$/, original))
    for (const url of urls) files.push({ item, url })
  }
  files.sort(
    (a, b) => (b.item.mime_type === 'application/pdf') - (a.item.mime_type === 'application/pdf')
  )
  const entries = await pool(
    files,
    Number(process.env.ARCHIVE_POOL || 6),
    async ({ item, url }) => {
      const entry = {
        id: item.id,
        title: text(item.title?.rendered || ''),
        mime: item.mime_type,
        url,
      }
      entry.attachedTo = item.post || undefined
      if (url !== item.source_url) entry.originalOf = item.source_url
      const path = join(out, 'media', host, decodeURIComponent(new URL(url).pathname))
      if (existsSync(path)) {
        const buf = readFileSync(path)
        return { ...entry, bytes: buf.length, sha256: sha256(buf) }
      }
      const res = await get(url)
      if (!res.ok) return { ...entry, status: res.status }
      const buf = Buffer.from(await res.arrayBuffer())
      write(path, buf)
      return { ...entry, bytes: buf.length, sha256: sha256(buf) }
    }
  )
  return entries.sort((a, b) => a.id - b.id || a.url.localeCompare(b.url))
}

/** Each flipbook's PDF, saved beside the media and hashed. Many are attached
 * to posts `wp/v2/media` does not list, so they are fetched by their URL. */
export async function flipbookPdfs(books, out) {
  return pool(books, Number(process.env.ARCHIVE_POOL || 6), async (book) => {
    if (!book.source) return book
    const { host, pathname } = new URL(book.source)
    const path = join(out, 'media', host, decodeURIComponent(pathname))
    let buf
    if (existsSync(path)) {
      buf = readFileSync(path)
    } else {
      const res = await get(book.source)
      if (!res.ok) return { ...book, status: res.status }
      buf = Buffer.from(await res.arrayBuffer())
      write(path, buf)
    }
    return { ...book, bytes: buf.length, sha256: sha256(buf) }
  })
}

async function products() {
  const host = 'https://newheightseducation.org/wp-json/wc/store/v1/products'
  const list = await allPages(host, 20)
  return pool(list, 4, async (p) => {
    const variations = await pool(p.variations || [], 4, async (v) => {
      const res = await get(`${host}/${v.id}`)
      if (!res.ok) return { id: v.id, attributes: v.attributes, status: res.status }
      const body = await res.json()
      return {
        id: v.id,
        attributes: v.attributes,
        sku: body.sku,
        prices: body.prices,
        inStock: body.is_in_stock,
      }
    })
    return {
      id: p.id,
      name: decode(p.name),
      slug: p.slug,
      permalink: p.permalink,
      sku: p.sku,
      type: p.type,
      prices: p.prices,
      priceHtml: p.price_html,
      inStock: p.is_in_stock,
      categories: p.categories?.map((c) => c.slug),
      attributes: p.attributes,
      images: p.images?.map((i) => ({ src: i.src, alt: i.alt })),
      shortDescription: p.short_description,
      description: p.description,
      addToCart: p.add_to_cart,
      variations,
    }
  })
}

async function wpJson(host, out) {
  for (const type of ['pages', 'posts']) {
    write(
      join(out, 'wp-json', host, `${type}.json`),
      JSON.stringify(await allPages(`https://${host}/wp-json/wp/v2/${type}`, 20), null, 2)
    )
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('archive-live-site.mjs')
if (invokedDirectly) {
  const { data, out } = parseArgs({
    options: { data: { type: 'string' }, out: { type: 'string' } },
  }).values
  if (!data || !out) {
    console.error('usage: archive-live-site.mjs --data <dir> --out <dir>')
    process.exit(1)
  }
  const books = []
  const forms = new Map()
  const crawled = {}
  for (const host of HOSTS) {
    const pages = await crawl(host, out)
    crawled[host] = {
      pages: pages.length,
      paginated: pages.filter((p) => /\/page\/\d+\/$/.test(p.url)).length,
    }
    for (const { url, html } of pages) {
      for (const book of dflipSources(html)) {
        const local =
          book.source &&
          `_ffc-assets/${new URL(book.source).host}${decodeURIComponent(new URL(book.source).pathname)}`
        books.push({ page: url, ...book, local })
      }
      for (const form of formsIn(html)) {
        const key = `${host}|${formKey(form)}`
        if (!forms.has(key)) forms.set(key, { host, ...form, pages: [] })
        forms.get(key).pages.push(url)
      }
    }
  }
  writeJson(join(data, 'dflip-sources.json'), await flipbookPdfs(books, out))
  writeJson(
    join(data, 'forms.json'),
    [...forms.values()].map(({ pages, ...form }) =>
      pages.length > 20
        ? { ...form, pageCount: pages.length, pages: pages.slice(0, 3) }
        : { ...form, pages }
    )
  )
  writeJson(join(data, 'crawl.json'), crawled)
  for (const host of HOSTS) {
    const manifest = await media(host, out)
    writeJson(join(data, `media-manifest.${host}.json`), manifest)
    console.log(`${host}: ${manifest.length} media files`)
  }
  writeJson(join(data, 'products.json'), await products())
  for (const host of HOSTS) await wpJson(host, out)
}
