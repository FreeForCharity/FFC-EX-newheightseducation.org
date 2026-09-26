#!/usr/bin/env node
/**
 * Compare the deployed export against the SOURCE site it was captured from.
 *
 * Every other check in this repo asks whether the export is internally sound:
 * does each page have a heading, do its assets load, does it render something
 * above the fold. None of them can see the one question a migration is
 * actually judged on -- is this the same site? Two defects shipped past a
 * fully green board for exactly that reason: the home page was the
 * publications page (#1370), and a full-height hero left the phone fold blank
 * while the desktop it was verified on looked fine.
 *
 * Deliberately NOT part of `pnpm test` or the PR checks. It fetches a third
 * party's live WordPress on every run, which is slow and rude, and that origin
 * already returned 503s under the capture's own crawl at 250ms spacing. It
 * runs on a schedule and on demand.
 *
 *   node scripts/verify-fidelity.mjs \
 *     --source https://newheightseducation.org \
 *     --export https://freeforcharity.github.io/FFC-EX-newheightseducation.org \
 *     --sample 25 --report fidelity.json [--strict]
 *
 * Exit codes: 0 clean (or findings without --strict), 1 findings with
 * --strict, 2 the comparison could not be made at all. The third is the
 * important one -- see `looksLikeTheExport`.
 */
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------- pure parts

/** Entities the captured markup and the source disagree about cosmetically. */
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&#8217;': '’',
  '&#8216;': '‘',
  '&#8220;': '“',
  '&#8221;': '”',
  '&#8211;': '–',
  '&#8212;': '—',
}

/**
 * Reduce a string to what a reader would call "the same text".
 *
 * The comparison has to survive transforms 706 makes ON PURPOSE, or it reports
 * the pipeline's own corrections as infidelity. Two are load-bearing here:
 * WordPress's magic-quotes legacy stores `What\'s` and the capture unescapes
 * it, and curly quotes arrive as entities on one side and characters on the
 * other. Both are cosmetic and neither means the page changed.
 */
export function normalizeText(value) {
  if (typeof value !== 'string') return ''
  let out = value
  for (const [entity, char] of Object.entries(ENTITIES)) out = out.split(entity).join(char)
  return out
    .replace(/\\(['"])/g, '$1') // magic-quotes leftovers the capture strips
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Strip scripts, styles and tags; keep what a reader sees.
 *
 * Every end tag is `<\/x\s*>`, not `<\/x>`. HTML allows whitespace between
 * the tag name and the `>`, so `</script >`, `</script\n>` and `</script\t>`
 * all close a script element -- and a pattern that requires the bare form
 * fails to match them, leaving the ENTIRE script body in the "visible" text.
 * Measured on `<script>var leaked=1;</script >`: the bare pattern returns
 * "real var leaked=1;" where this one returns "real".
 *
 * That is not cosmetic here. The word-count ratio is one of only two blocking
 * assertions in `comparePages`, and inflating one side's word count with
 * JavaScript source moves it in the passing direction -- a page that lost
 * most of its prose could score healthy because its scripts made up the
 * difference. Reported by CodeQL (`js/bad-tag-filter`) on #33.
 */
export function visibleText(html) {
  if (typeof html !== 'string') return ''
  return normalizeText(
    html
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
}

export function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html || '')
  return normalizeText(m ? m[1] : '')
}

export function extractHeadings(html) {
  const out = []
  for (const m of (html || '').matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]\s*>/gi)) {
    const text = normalizeText(m[1].replace(/<[^>]+>/g, ' '))
    if (text) out.push(text)
  }
  return out
}

/**
 * Token-set overlap, 0..1. Used instead of string equality so a title that
 * gained or lost a separator, a suffix or a stray entity is a near-match
 * rather than a failure, while a genuinely different page scores near zero.
 */
export function similarity(a, b) {
  const left = new Set(normalizeText(a).split(' ').filter(Boolean))
  const right = new Set(normalizeText(b).split(' ').filter(Boolean))
  if (!left.size && !right.size) return 1
  if (!left.size || !right.size) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return shared / (left.size + right.size - shared)
}

/**
 * The part of a title before its first separator.
 *
 * WordPress themes render `Page Name | Site Name`, and a migration routinely
 * keeps, drops or rewrites that suffix. Comparing whole titles makes every
 * such page look unfaithful; comparing the leading segment makes the suffix a
 * non-difference. Measured on the two cases that matter:
 *
 *   whole titles   leading segments
 *   0.400          0.000   home page vs the publications page (#1370)
 *   0.375          1.000   the same page with its site-name suffix dropped
 *
 * Whole-title comparison scores those 0.400 and 0.375 -- barely apart, and on
 * the wrong side of any bar you could draw. Leading segments separate them
 * completely.
 */
const TITLE_SEPARATOR = /\s*[|\u2013\u2014\u00b7\u2022]\s*|\s+-\s+/

/**
 * `normalizeText` without the dash folding, for reading separators.
 *
 * `normalizeText` rewrites en and em dashes to `-` because in PROSE they are
 * the same character to a reader. In a TITLE they are separators, and folding
 * them first made both branches below dead code: measured, `A\u2014B` came out of
 * `normalizeText` as `a-b`, which matches neither `[\u2013\u2014]` (the characters are
 * gone) nor `\s+-\s+` (there are no spaces), so the title did not split at
 * all. `Who We Are\u2014New Heights Educational Group` against `Who We Are` then
 * scored 0.286 and FAILED a page whose only sin was dropping its site-name
 * suffix -- the exact case `titleSimilarity` was written to forgive.
 *
 * Bare `-` still needs surrounding spaces, so `Well-known hyphen kept` stays
 * one segment. Reported by copilot-pull-request-reviewer on #33.
 */
function normalizeKeepingDashes(value) {
  if (typeof value !== 'string') return ''
  let out = value
  for (const [entity, char] of Object.entries(ENTITIES)) out = out.split(entity).join(char)
  return out
    .replace(/\\(['"])/g, '$1')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function leadingSegment(title) {
  return normalizeText(normalizeKeepingDashes(title).split(TITLE_SEPARATOR)[0])
}

export function hasTitleSeparator(title) {
  return TITLE_SEPARATOR.test(normalizeKeepingDashes(title))
}

/**
 * How alike two page titles are, 0..1.
 *
 * KNOWN BLIND SPOT, and it is why `degenerateTitles` exists below. A theme
 * that renders `Site Name | Page Name` -- site FIRST -- puts the same leading
 * segment on every page, so every comparison scores 1.00 and this check sees
 * nothing. Measured: `NHEG | Who We Are` against `NHEG | Publications` scores
 * 1.000 here and should score near zero.
 *
 * Not worked around, because every workaround was worse: whole-title
 * comparison cannot separate the cases above, and stripping "the common part"
 * needs a corpus this function does not have. The CLI detects the shape
 * instead and says so, which turns a silent blindness into a reported one.
 */
export function titleSimilarity(source, exported) {
  if (hasTitleSeparator(source) || hasTitleSeparator(exported)) {
    return similarity(leadingSegment(source), leadingSegment(exported))
  }
  return similarity(source, exported)
}

/**
 * Do the sampled pages share one leading title segment?
 *
 * If they do, the site titles itself `Site Name | Page Name` and
 * `titleSimilarity` is uninformative for it -- every page scores 1.00 whether
 * or not it is the right page. Reported rather than silently tolerated: a
 * fidelity number that cannot move is the failure mode this whole script was
 * written after.
 */
export function degenerateTitles(titles) {
  const segments = titles.map(leadingSegment).filter(Boolean)
  if (segments.length < 3) return false
  const first = segments[0]
  return segments.every((s) => s === first)
}

/**
 * Is this page OUR export rather than the source?
 *
 * The single most important guard here, and the reason this script can exit 2.
 * After the DNS cutover the source domain serves the export, so every
 * comparison becomes the export against itself and scores a perfect 1.00
 * forever. A fidelity gate that reports flawless fidelity while measuring
 * nothing is worse than no gate, and it would do it silently and permanently.
 *
 * Keyed on CLASS NAMES the FFC build emits -- `ffc-clone` around captured
 * markup and `ffc-footer` on the attribution block -- and deliberately NOT on
 * the text "Free For Charity".
 *
 * The free-text version is what this shipped with for one commit, and it is
 * wrong in the direction that costs the most: FFC BUILDS these sites, so a
 * charity crediting its sponsor in a footer would trip the guard and this
 * check would refuse to run, reporting a completed cutover that had not
 * happened. Measured on newheightseducation.org the captured markup contains
 * the phrase zero times today, so it would not have fired here -- but "the
 * first site it breaks on is some other charity" is not a property to ship,
 * and 706 puts this script in every migration.
 *
 * A class name is an implementation detail of the FFC template. Source markup
 * has no reason to carry one.
 */
export function looksLikeTheExport(html) {
  if (typeof html !== 'string') return false
  // Any legal spelling of the attribute, not just `class="..."`. Measured,
  // the double-quote-only form returned false for `class='ffc-clone'`,
  // `class = "ffc-clone"` and `class=ffc-clone` alike -- and a guard that
  // fails to fire does not fail loudly here, it lets the run score the export
  // against itself and report 1.00 forever, which is the single outcome this
  // function exists to prevent. Reported by copilot-pull-request-reviewer.
  //
  // The token test uses whitespace boundaries rather than `\b`: `\bffc-clone\b`
  // also matches inside `ffc-clone-wrapper`, because `-` ends a word.
  for (const m of html.matchAll(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const value = m[1] ?? m[2] ?? m[3] ?? ''
    if (/(^|\s)(ffc-clone|ffc-footer)(\s|$)/.test(value)) return true
  }
  return false
}

/**
 * The source URL a built route was captured from.
 *
 * Unmounted captures are 1:1, which is the only shape this handles. A mounted
 * capture (`--mount school`) puts the source's `/x/` at the export's
 * `/school/x/`, so the caller passes the mount and it is stripped back off.
 */
export function sourceUrlFor(route, sourceOrigin, mount = '') {
  const origin = String(sourceOrigin).replace(/\/+$/, '')
  let path = String(route)
  if (!path.startsWith('/')) path = `/${path}`
  if (mount) {
    const prefix = `/${String(mount).replace(/^\/+|\/+$/g, '')}/`
    if (path === prefix.replace(/\/$/, '') || path === prefix) path = '/'
    else if (path.startsWith(prefix)) path = `/${path.slice(prefix.length)}`
  }
  return `${origin}${path}`
}

/**
 * Which built routes came from the source.
 *
 * Read from `src/clone-content/`, not from a hand-written allowlist: a page
 * has a clone-content file exactly when the capture wrote one, so the set
 * cannot drift from what was actually captured. Measured on this repo it
 * returns 430 of 438 built routes, which is the same 430 the capture report
 * records under `captured.total` -- the eight it leaves out are FFC's own
 * pages (404, cookie-policy, terms-of-service and the rest), which have no
 * source to be unfaithful to.
 */
export function capturedRoutes(outDir, cloneDir) {
  const routes = []
  const walk = (dir, prefix) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (['_next', '_ffc-assets', 'Images', 'Svgs'].includes(entry.name)) continue
        walk(join(dir, entry.name), `${prefix}/${entry.name}`)
      } else if (entry.name === 'index.html') {
        routes.push(`${prefix}/` || '/')
      }
    }
  }
  walk(outDir, '')
  return routes
    .map((r) => (r === '/' || r.endsWith('/') ? r : `${r}/`))
    .filter((r) => {
      const stem = r === '/' ? 'index' : r.replace(/^\/|\/$/g, '')
      return existsSync(join(cloneDir, `${stem}.html`))
    })
    .sort()
}

/**
 * A spread across the route list, always including the front page.
 *
 * Evenly spaced rather than random: a run that samples different pages every
 * time cannot be compared with the one before it, and this is a check whose
 * numbers only become thresholds once several runs agree.
 */
export function sampleRoutes(routes, size) {
  const all = [...routes]
  if (size <= 0 || all.length <= size) return all
  const home = all.includes('/') ? ['/'] : []
  const rest = all.filter((r) => r !== '/')
  const step = rest.length / (size - home.length)
  const picked = []
  for (let i = 0; i < size - home.length; i += 1) picked.push(rest[Math.floor(i * step)])
  return [...home, ...new Set(picked)]
}

/**
 * Compare one page against its source.
 *
 * Only two things are treated as failures, and both are chosen because they
 * need no calibration to be meaningful:
 *
 *   - the titles describe different pages (token overlap below
 *     MIN_TITLE_SIMILARITY). This is the #1370 shape exactly -- the export
 *     served the publications page as the home page, and its title said so.
 *   - the export kept almost none of the source's text. A page that lost 80%
 *     of its words is broken however the remaining 20% is arranged.
 *
 * Everything else -- exact text ratio, heading overlap -- is recorded and NOT
 * failed on. Those need thresholds, thresholds need measurements across
 * several runs against the live source, and this sandbox cannot reach it.
 * Reporting a number is honest; inventing a bound for it is not.
 */
export const MIN_TITLE_SIMILARITY = 0.5
export const MIN_TEXT_RATIO = 0.2

export function comparePages(route, source, exported) {
  const findings = []
  const titleScore = titleSimilarity(source.title, exported.title)
  const sourceWords = source.text ? source.text.split(' ').length : 0
  const exportWords = exported.text ? exported.text.split(' ').length : 0
  const textRatio = sourceWords ? exportWords / sourceWords : null
  const sourceHeadings = new Set(source.headings)
  const keptHeadings = exported.headings.filter((h) => sourceHeadings.has(h)).length

  if (source.title && exported.title && titleScore < MIN_TITLE_SIMILARITY) {
    findings.push(
      `title describes a different page (overlap ${titleScore.toFixed(2)}): ` +
        `source "${source.title}" vs export "${exported.title}"`
    )
  }
  if (textRatio !== null && sourceWords >= 50 && textRatio < MIN_TEXT_RATIO) {
    findings.push(
      `export kept ${Math.round(textRatio * 100)}% of the source's text ` +
        `(${exportWords} of ${sourceWords} words)`
    )
  }

  return {
    route,
    sourceTitle: source.title,
    exportTitle: exported.title,
    titleScore: Number(titleScore.toFixed(3)),
    sourceWords,
    exportWords,
    textRatio: textRatio === null ? null : Number(textRatio.toFixed(3)),
    sourceHeadings: source.headings.length,
    keptHeadings,
    findings,
  }
}

// ------------------------------------------------------------------- the CLI

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const flag = (name) => process.argv.includes(`--${name}`)

async function fetchPage(url, timeoutMs) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'ffc-fidelity-check (+https://github.com/FreeForCharity)' },
    })
    return { status: res.status, html: res.ok ? await res.text() : '' }
  } catch (err) {
    return { status: 0, html: '', error: String(err && err.message ? err.message : err) }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const sourceOrigin = arg('source')
  const exportOrigin = arg('export')
  if (!sourceOrigin || !exportOrigin) {
    console.error('usage: verify-fidelity.mjs --source <origin> --export <origin> [options]')
    process.exit(2)
  }
  const outDir = arg('out', 'out')
  const cloneDir = arg('clone-content', join('src', 'clone-content'))
  const mount = arg('mount', '')
  const size = Number(arg('sample', '25'))
  const delayMs = Number(arg('delay-ms', '750'))
  const timeoutMs = Number(arg('timeout-ms', '30000'))
  const reportPath = arg('report', '')
  const strict = flag('strict')

  const routes = capturedRoutes(outDir, cloneDir)
  if (!routes.length) {
    console.error(`::error::no captured routes found under ${outDir} + ${cloneDir}. Build first?`)
    process.exit(2)
  }
  const sample = sampleRoutes(routes, size)
  console.error(
    `[fidelity] ${routes.length} captured routes, sampling ${sample.length}, ` +
      `${delayMs}ms apart against ${sourceOrigin}`
  )

  // The cutover guard, run ONCE up front against the front page. If the source
  // is already serving our export there is nothing to compare and every
  // subsequent score would be a meaningless 1.00.
  const frontUrl = sourceUrlFor('/', sourceOrigin, mount)
  const front = await fetchPage(frontUrl, timeoutMs)
  if (front.status === 200 && looksLikeTheExport(front.html)) {
    console.error(
      `::error::${frontUrl} is already serving the FFC export, so there is no source left to ` +
        'compare against. This is what a completed DNS cutover looks like: retire this check ' +
        'for the site, or point --source at the archived original. Refusing to report a ' +
        'fidelity score that would be measuring the export against itself.'
    )
    process.exit(2)
  }
  if (front.status !== 200) {
    console.error(
      `::error::${frontUrl} returned HTTP ${front.status}${front.error ? ` (${front.error})` : ''}. ` +
        'The source is unreachable, so no comparison was made. Not reporting this as fidelity.'
    )
    process.exit(2)
  }

  const rows = []
  const unreachable = []
  for (const route of sample) {
    const srcUrl = sourceUrlFor(route, sourceOrigin, mount)
    const expUrl = `${exportOrigin.replace(/\/+$/, '')}${route}`
    const [src, exp] = [await fetchPage(srcUrl, timeoutMs), await fetchPage(expUrl, timeoutMs)]
    await sleep(delayMs)

    if (src.status !== 200) {
      // The charity may simply have deleted the page since the capture. Worth
      // seeing, not worth failing a deployment over.
      unreachable.push({ route, url: srcUrl, status: src.status })
      continue
    }
    if (exp.status !== 200) {
      rows.push({
        route,
        findings: [`export returned HTTP ${exp.status} for a route the source still serves`],
      })
      continue
    }
    rows.push(
      comparePages(
        route,
        {
          title: extractTitle(src.html),
          text: visibleText(src.html),
          headings: extractHeadings(src.html),
        },
        {
          title: extractTitle(exp.html),
          text: visibleText(exp.html),
          headings: extractHeadings(exp.html),
        }
      )
    )
  }

  // Say so when the check cannot see anything, rather than printing a clean
  // score. This is the shape that started all of this: a green board over a
  // broken page.
  if (degenerateTitles(rows.map((r) => r.sourceTitle).filter(Boolean))) {
    console.error(
      '::warning::every sampled page shares one leading title segment, so this site titles ' +
        'itself "Site Name | Page Name" and the title comparison cannot tell a right page from ' +
        'a wrong one. Treat the title scores below as uninformative for this site.'
    )
  }

  const failing = rows.filter((r) => r.findings.length)
  const scored = rows.filter((r) => typeof r.titleScore === 'number')
  const median = (xs) =>
    xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null
  const summary = {
    checkedAt: new Date().toISOString(),
    source: sourceOrigin,
    export: exportOrigin,
    capturedRoutes: routes.length,
    sampled: sample.length,
    compared: rows.length,
    sourceUnreachable: unreachable.length,
    medianTitleScore: median(scored.map((r) => r.titleScore)),
    medianTextRatio: median(scored.map((r) => r.textRatio).filter((x) => typeof x === 'number')),
    withFindings: failing.length,
  }

  console.error(`\n[fidelity] ${JSON.stringify(summary, null, 1)}`)
  for (const row of failing)
    for (const f of row.findings) console.error(`::error::${row.route}: ${f}`)
  for (const u of unreachable)
    console.error(`[fidelity] source no longer serves ${u.url} (HTTP ${u.status})`)

  if (reportPath) {
    writeFileSync(
      reportPath,
      `${JSON.stringify({ summary, rows, unreachable }, null, 2)}\n`,
      'utf8'
    )
    console.error(`[fidelity] report written to ${reportPath}`)
  }
  process.exit(failing.length && strict ? 1 : 0)
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('verify-fidelity.mjs')
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`::error::fidelity check crashed: ${err && err.stack ? err.stack : err}`)
    process.exit(2)
  })
}
