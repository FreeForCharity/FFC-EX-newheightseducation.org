import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The generator is an ESM script, so these run it through node the way the
 * rest of the scripts suite does rather than importing it into jest's
 * transform pipeline.
 */
function evaluate(expression: string): unknown {
  // A file: URL, since import() rejects C:\\ paths on Windows.
  const script = pathToFileURL(join(process.cwd(), 'scripts', 'generate-og-card.mjs')).href
  const result = spawnSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(script)});\nprocess.stdout.write(JSON.stringify(${expression}))`,
    ],
    { cwd: process.cwd(), encoding: 'utf8' }
  )

  if (result.status !== 0) {
    throw new Error(`node exited ${result.status}: ${result.stderr}`)
  }
  return JSON.parse(result.stdout)
}

describe('social card palette', () => {
  // themeColor is the BROWSER-UI colour, and this template ships '#ffffff'.
  // A card that always drew white text would render an empty white image --
  // and nothing downstream would report it, because a 1200x630 PNG is exactly
  // what every other check looks for. That is why the palette is derived.
  it('uses dark text on a light themeColor', () => {
    const palette = evaluate("m.cardPalette('#ffffff')") as Record<string, string>

    expect(palette.title).toBe('#0b1020')
    expect(palette.title).not.toBe('#ffffff')
  })

  it('uses light text on a dark themeColor', () => {
    const palette = evaluate("m.cardPalette('#0b1020')") as Record<string, string>

    expect(palette.title).toBe('#ffffff')
  })

  // A malformed value must not throw mid-build, and must not quietly compute
  // a luminance from garbage -- the dark palette is the safe default because
  // an unparseable colour most often ends up rendering as a dark or
  // transparent background.
  it('falls back to the dark palette for an unparseable colour', () => {
    expect(evaluate("m.relativeLuminance('not-a-colour')")).toBeNull()
    expect((evaluate("m.cardPalette('not-a-colour')") as Record<string, string>).title).toBe(
      '#ffffff'
    )
  })

  it('uses dark text on a mid-luminance brand colour such as #ff6900', () => {
    const palette = evaluate("m.cardPalette('#ff6900')") as Record<string, string>
    expect(palette.title).not.toBe('#ffffff')
  })

  it('keeps every colour at 3:1 or more on mid-tone and theme backgrounds', () => {
    for (const bg of ['#ff6900', '#1e5631', '#ffffff', '#0b1020', '#7f7f7f']) {
      const ratios = evaluate(
        `Object.values(m.cardPalette('${bg}')).map((c) => m.contrastRatio(c, '${bg}'))`
      ) as number[]
      for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(3)
    }
  })

  it('computes WCAG relative luminance', () => {
    expect(evaluate("m.relativeLuminance('#ffffff')")).toBeCloseTo(1, 5)
    expect(evaluate("m.relativeLuminance('#000000')")).toBeCloseTo(0, 5)
    // Accepts the form site.config.ts actually stores, with and without '#'.
    expect(evaluate("m.relativeLuminance('ffffff')")).toBeCloseTo(1, 5)
  })

  // Importing the module must not render or write anything: the test above
  // would otherwise overwrite public/og-card.png on every run.
  it('does not render when imported', () => {
    expect(evaluate('m.CARD_WIDTH')).toBe(1200)
    expect(evaluate('m.CARD_HEIGHT')).toBe(630)
  })
})

describe('committed social card', () => {
  // Renders from the current siteConfig, so a broken generator or a card left
  // stale after a config change both fail here.
  it('matches a fresh render from siteConfig', () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs')
    const committed = readFileSync(join(process.cwd(), 'public', 'og-card.png'))
    const fresh = evaluate(`(await m.renderCard()).toString('base64')`) as string
    expect(Buffer.from(fresh, 'base64').equals(committed)).toBe(true)
  }, 60000)

  it('is the 1200x630 PNG every page shares', () => {
    const { readFileSync } = jest.requireActual<typeof import('node:fs')>('node:fs')
    const png = readFileSync(join(process.cwd(), 'public', 'og-card.png'))
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
    const { OG_IMAGE } =
      jest.requireActual<typeof import('@/lib/page-metadata')>('@/lib/page-metadata')
    expect(OG_IMAGE.url).toMatch(/\/og-card\.png$/)
    expect(OG_IMAGE.width).toBe(1200)
    expect(OG_IMAGE.height).toBe(630)
  })
})

describe('social card URL', () => {
  const original = process.env.NEXT_PUBLIC_BASE_PATH
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
    else process.env.NEXT_PUBLIC_BASE_PATH = original
  })

  // metadataBase already carries the basePath; an image URL that adds it
  // again 404s in every link preview, as it did on the live github.io site.
  it('carries the GitHub Pages basePath exactly once', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/FFC-EX-newheightseducation.org'
    jest.isolateModules(() => {
      const { OG_IMAGE } =
        jest.requireActual<typeof import('@/lib/page-metadata')>('@/lib/page-metadata')
      expect(OG_IMAGE.url).toBe(
        'https://freeforcharity.github.io/FFC-EX-newheightseducation.org/og-card.png'
      )
    })
  })
})
