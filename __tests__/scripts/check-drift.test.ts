import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * Contract tests for the Pages config-discard rule in scripts/check-drift.mjs.
 *
 * `actions/configure-pages` with `static_site_generator: next` only understands
 * next.config.js/.mjs. With a TypeScript config it writes its OWN next.config.js
 * — which Next then prefers — so every setting in next.config.ts is discarded on
 * each deploy. Measured on Footer_Only_Template: removing that input alone
 * flipped /privacy-policy/ from 404 to 200
 * (FreeForCharity/FFC-Cloudflare-Automation#880).
 *
 * The detector is a pure function, exercised by importing the module in a child
 * node process (the script is ESM and must stay outside the jest/ts transform);
 * the script itself is also run end-to-end against this repo's real workflows.
 */
const root = join(__dirname, '..', '..')
const script = join(root, 'scripts', 'check-drift.mjs')

type Finding = { path: string; line: number; message: string }

/** Runs `pagesConfigDiscardFindings(workflows, configs)` in a child node process. */
function findingsInChild(
  workflows: { path: string; body: string }[],
  nextConfigFilenames: string[]
): Finding[] {
  const href = pathToFileURL(script).href
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(href)});` +
        `const out = m.pagesConfigDiscardFindings(` +
        `${JSON.stringify(workflows)}, ${JSON.stringify(nextConfigFilenames)});` +
        `process.stdout.write(JSON.stringify(out))`,
    ],
    { encoding: 'utf8' }
  )
  return JSON.parse(out)
}

const wf = (body: string) => [{ path: '.github/workflows/deploy.yml', body }]

const ACTIVE_INPUT = [
  'jobs:',
  '  build:',
  '    steps:',
  '      - name: Setup Pages',
  '        uses: actions/configure-pages@v6',
  '        with:',
  '          static_site_generator: next',
  '',
].join('\n')

// The real remediation in this repo: the input is gone and a comment block
// explains why. A guard that matched the string rather than the YAML key would
// flag this and make the fix unshippable.
const COMMENTED_OUT = [
  '      - name: Setup Pages',
  '        uses: actions/configure-pages@v6',
  '        # `static_site_generator: next` is deliberately NOT set. It only understands',
  '        # next.config.js/.mjs; this repo uses next.config.ts, so the action logged',
  '        # "Using default blank configuration" and WROTE ITS OWN next.config.js.',
  '',
].join('\n')

describe('check-drift: Pages config discard', () => {
  it('flags an active static_site_generator input alongside next.config.ts', () => {
    const findings = findingsInChild(wf(ACTIVE_INPUT), ['next.config.ts'])
    expect(findings).toHaveLength(1)
    expect(findings[0].path).toBe('.github/workflows/deploy.yml')
    expect(findings[0].line).toBe(7)
    expect(findings[0].message).toContain('next.config.ts')
    expect(findings[0].message).toContain('FFC-Cloudflare-Automation#880')
  })

  it('does not flag the input when it is only named in a comment', () => {
    expect(findingsInChild(wf(COMMENTED_OUT), ['next.config.ts'])).toEqual([])
  })

  it('does not flag a JavaScript Next config — the action can read those', () => {
    expect(findingsInChild(wf(ACTIVE_INPUT), ['next.config.js'])).toEqual([])
    expect(findingsInChild(wf(ACTIVE_INPUT), ['next.config.mjs'])).toEqual([])
  })

  it('flags every TypeScript config extension the action cannot read', () => {
    for (const cfg of ['next.config.ts', 'next.config.mts', 'next.config.cts']) {
      expect(findingsInChild(wf(ACTIVE_INPUT), [cfg])).toHaveLength(1)
    }
  })

  it('stays quiet when a readable JS config sits alongside the TypeScript one', () => {
    // The action edits that file instead of generating one, and Next prefers it
    // over the .ts either way — so the .ts is dead for a reason removing this
    // input would not fix. Wrong diagnosis, no CI failure.
    for (const readable of ['next.config.js', 'next.config.mjs']) {
      expect(findingsInChild(wf(ACTIVE_INPUT), [readable, 'next.config.ts'])).toEqual([])
    }
  })

  it('still flags a .cjs alongside the TypeScript config — the action reads neither', () => {
    expect(findingsInChild(wf(ACTIVE_INPUT), ['next.config.cjs', 'next.config.ts'])).toHaveLength(1)
  })

  it('is not fooled by quoting, spacing, or a trailing comment', () => {
    const variants = [
      '          static_site_generator: "next"',
      "          static_site_generator: 'next'",
      '          static_site_generator:   next',
      '          static_site_generator: next # injects basePath',
    ]
    for (const line of variants) {
      expect(findingsInChild(wf(line + '\n'), ['next.config.ts'])).toHaveLength(1)
    }
  })

  it('reports every occurrence across every workflow, not just the first', () => {
    const findings = findingsInChild(
      [
        { path: '.github/workflows/deploy.yml', body: ACTIVE_INPUT + ACTIVE_INPUT },
        { path: '.github/workflows/staging.yml', body: ACTIVE_INPUT },
      ],
      ['next.config.ts']
    )
    expect(findings).toHaveLength(3)
    expect(findings.map((f) => f.path)).toContain('.github/workflows/staging.yml')
  })

  it('reports nothing when no Next config is present at all', () => {
    expect(findingsInChild(wf(ACTIVE_INPUT), [])).toEqual([])
  })
})

/** Runs one FFC_IDENTITY_PATTERNS entry against a string in a child process. */
function identityMatches(label: string, text: string): boolean {
  const href = pathToFileURL(script).href
  const out = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(href)});` +
        `const p = m.FFC_IDENTITY_PATTERNS.find((x) => x.label.includes(${JSON.stringify(label)}));` +
        `if (!p) throw new Error('no pattern labelled ' + ${JSON.stringify(label)});` +
        `process.stdout.write(String(p.re.test(${JSON.stringify(text)})))`,
    ],
    { encoding: 'utf8' }
  )
  return out.trim() === 'true'
}

/**
 * The phone pattern was `520[\s.-]?222[\s.-]?8104` — at most ONE separator
 * character — so it saw `520-222-8104` and was blind to `(520) 222-8104`,
 * which has two. It missed exactly that on `src/app/donation-policy/page.tsx`,
 * a live route soliciting donations, and the rebrand gate reported no drift.
 *
 * Every one of these is the same number a visitor would dial, so a gate that
 * catches one spelling and not another is not catching the number.
 */
describe('FFC identity patterns — phone number spellings', () => {
  const phone = "Free For Charity's phone number"

  it.each([
    '(520) 222-8104',
    '(520)222-8104',
    '520-222-8104',
    '520.222.8104',
    '520 222 8104',
    '5202228104',
  ])('matches %s', (text) => {
    expect(identityMatches(phone, text)).toBe(true)
  })

  it.each([
    ["the charity's own number", '419.786.0247'],
    ['a different number that shares a prefix', '520-222-8105'],
  ])('does not match %s', (_why, text) => {
    expect(identityMatches(phone, text)).toBe(false)
  })
})

describe('check-drift script (end to end)', () => {
  it('passes against this repo — no live workflow discards next.config.ts', () => {
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8' })
    expect(out).toContain('No drift')
  })
})
