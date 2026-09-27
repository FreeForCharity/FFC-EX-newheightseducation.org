#!/usr/bin/env node
/**
 * Can the visual check still tell a styled page from an unstyled one?
 *
 * This runs BEFORE every real comparison, and the workflow aborts if it
 * fails. The reason is the failure mode the whole gate exists to avoid: a
 * screenshot comparison that has quietly stopped discriminating reports a
 * clean score forever, and a clean score is indistinguishable from a healthy
 * site. `post-deploy-smoke.yml` has been taking two screenshots every run for
 * weeks and comparing them against nothing -- the pictures were real, the
 * assurance was not.
 *
 * Four scenarios against two throwaway origins on loopback:
 *
 *   identical pages           ->  ~0%,   exit 0
 *   one-character copy edit   ->  under threshold, exit 0
 *   SAME TEXT, no stylesheet  ->  ~63%,  exit 1   <- the defect that matters
 *   page unreachable          ->  exit 2, never a pass
 *
 * Keep the third. `verify-fidelity.mjs` scores that page 1.00 -- every word
 * present, in order, under the right title. Only pixels see it.
 *
 * Set VISUAL_CHROMIUM_PATH when the host's browser build is not the one
 * Playwright pins.
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const CHROME = process.env.VISUAL_CHROMIUM_PATH || ''
const CLI = join(process.cwd(), 'scripts', 'verify-visual.mjs')

const STYLED = `<!doctype html><html><head><style>
  body{margin:0;font:16px/1.5 system-ui;background:#0b3d2e;color:#fff}
  .hero{height:420px;background:linear-gradient(135deg,#0b3d2e,#1e7a5a);padding:60px}
  h1{font-size:44px;margin:0 0 16px} .card{background:#fff;color:#111;padding:24px;margin:24px}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:24px}
  .grid div{background:#e8f5ef;height:160px}
</style></head><body>
  <div class="hero"><h1>New Heights Educational Group</h1><p>Tutoring and family support.</p></div>
  <div class="grid"><div></div><div></div><div></div></div>
  <div class="card"><h2>Who We Are</h2><p>A 501(c)(3) serving Ohio families.</p></div>
  <footer class="ffc-footer" style="background:#111;color:#fff;padding:40px">FFC footer, export only</footer>
</body></html>`

/** Same DOM, same words, no stylesheet. A text check cannot see this. */
const UNSTYLED = STYLED.replace(/<style>[\s\S]*?<\/style>/, '')
/** Tall enough that a 2000px capture has real content to reach. */
const TALL = STYLED.replace(
  '</body>',
  '<div style="height:2600px;background:linear-gradient(#0b3d2e,#fff)"></div></body>'
)
/** Same styling, trivially different copy. Must NOT trip the threshold. */
const TWEAKED = STYLED.replace('Tutoring and family support.', 'Tutoring and family support!')

let sourceBank = {}
let exportBank = {}

const serve = (read) =>
  http.createServer((req, res) => {
    const body = read()[(req.url || '/').split('?')[0]]
    if (body === undefined) {
      res.writeHead(404)
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(body)
  })

const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)))

/**
 * Async spawn, never spawnSync: the two servers live in this process, so a
 * synchronous child blocks the event loop that has to answer its requests and
 * every scenario reports "unreachable" -- including the one that expects it,
 * which then passes for the wrong reason.
 */
const run = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, args)
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (status) => resolve({ status, out }))
  })

const src = serve(() => sourceBank)
const exp = serve(() => exportBank)
const diffDir = mkdtempSync(join(tmpdir(), 'visual-selftest-'))
const results = []

try {
  const sp = await listen(src)
  const ep = await listen(exp)

  const compare = (source, exported, width = 1000, height = 900) => {
    sourceBank = source
    exportBank = exported
    return run([
      CLI,
      '--source',
      `http://127.0.0.1:${sp}`,
      '--export',
      `http://127.0.0.1:${ep}`,
      '--routes',
      '/',
      '--width',
      String(width),
      '--height',
      String(height),
      '--settle-ms',
      '150',
      '--delay-ms',
      '0',
      '--timeout-ms',
      '20000',
      '--diff-dir',
      diffDir,
      '--strict',
      ...(CHROME ? ['--executable', CHROME] : []),
    ])
  }

  const check = async (label, source, exported, want, width, height) => {
    const r = await compare(source, exported, width, height)
    const m = /"medianDiffRatio": ([0-9.]+|null)/.exec(r.out)
    const ratio = m && m[1] !== 'null' ? Number(m[1]) : null
    results.push({ label, ok: want(r.status, ratio, r.out), status: r.status, ratio, out: r.out })
  }

  await check(
    'identical pages score ~0 and pass',
    { '/': STYLED },
    { '/': STYLED },
    (s, ratio) => s === 0 && ratio !== null && ratio < 0.02
  )

  await check(
    'a copy tweak stays under the threshold',
    { '/': STYLED },
    { '/': TWEAKED },
    (s, ratio) => s === 0 && ratio !== null && ratio < 0.15
  )

  await check(
    'SAME TEXT, no stylesheet -> detected',
    { '/': STYLED },
    { '/': UNSTYLED },
    (s, ratio) => s === 1 && ratio !== null && ratio > 0.15
  )

  await check('an unreachable page is not a pass', {}, { '/': STYLED }, (s) => s === 2)

  // At the DEFAULT height, which every scenario above avoids. Playwright
  // silently CLAMPS a clip taller than the viewport rather than rejecting it:
  // measured, viewport 1200 with `clip.height: 2000` returns a 1280x1200 PNG
  // and no error. That under-measured every page by 800px while the report
  // said `1280x2000`. A self-test that only ever runs where the clip fits
  // cannot see it -- which is exactly what happened here.
  await check(
    'the default height is really captured, not silently clamped',
    { '/': TALL },
    { '/': TALL },
    (s, ratio, out) => s === 0 && ratio === 0 && /"comparedPx": "1280x2000"/.test(out),
    1280,
    2000
  )
} finally {
  src.close()
  exp.close()
  rmSync(diffDir, { recursive: true, force: true })
}

let failed = 0
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}   (exit ${r.status}, median ${r.ratio})`)
  if (!r.ok) {
    failed += 1
    console.log(
      r.out
        .split('\n')
        .map((l) => `      | ${l}`)
        .join('\n')
    )
  }
}
console.log(`\n${results.length - failed}/${results.length} self-test scenarios passed`)
if (failed) {
  console.error(
    '::error::the visual comparison can no longer distinguish a styled page from an ' +
      'unstyled one, so any score it reports is meaningless. Not running the real comparison.'
  )
}
process.exit(failed ? 1 : 0)
