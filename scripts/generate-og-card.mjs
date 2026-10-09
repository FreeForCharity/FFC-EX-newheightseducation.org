#!/usr/bin/env node
/**
 * Renders public/og-card.png -- the 1200x630 social card.
 *
 * Run after changing name, tagline, shortDescription or themeColor in
 * site.config.ts:
 *
 *   pnpm run og:card
 *
 * WHY A COMMITTED PNG AND NOT `src/app/opengraph-image.tsx`
 * --------------------------------------------------------
 * Next's file convention is the obvious answer and it is wrong for this
 * deployment. Measured on a real `NEXT_PUBLIC_BASE_PATH` build of a fork
 * before this script existed:
 *
 *   <meta property="og:image"
 *         content="https://freeforcharity.github.io/opengraph-image?9c0da00d"/>
 *
 * The base path is missing. Next composes that URL from `metadataBase`
 * without consulting `basePath`, so on a project-path GitHub Pages deploy the
 * card 404s -- the same "composed by a path that does not know about the
 * prefix" failure that took every navigation link down in
 * FFC-EX-neurospike.org#17, arriving from the other direction. The convention
 * also writes the file with NO extension (`out/opengraph-image`), which
 * GitHub Pages does not serve as image/png.
 *
 * A file in public/ referenced as an absolute siteUrl() has neither problem.
 * Not assetPath(): metadataBase already carries the base path, so an
 * assetPath() URL repeats it (src/lib/page-metadata.ts).
 *
 * The font is ImageResponse's bundled sans face -- deliberately no font file
 * and no network fetch, so this runs in CI and offline. It imports
 * site.config.ts directly, so it needs a Node that strips TypeScript types
 * (24, as CI uses).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import React from 'react'
import { ImageResponse } from 'next/og.js'
import { isPng } from './png-signature.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(ROOT, 'public', 'og-card.png')

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/**
 * Relative luminance per WCAG 2.1, for a `#rrggbb` string.
 *
 * Returns null for anything it cannot parse, so a malformed themeColor falls
 * back to the dark palette rather than throwing mid-build or, worse, quietly
 * computing a luminance from garbage.
 */
export function relativeLuminance(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!match) return null

  const channels = [0, 2, 4].map((offset) => {
    const value = parseInt(match[1].slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/**
 * Text colours for a given background.
 *
 * The background is `siteConfig.themeColor`, and the palette CANNOT be fixed
 * light-on-dark: themeColor is the browser-UI colour, and this template ships
 * `#ffffff`. White text on a white card is not a subtle degradation -- it is
 * an empty image, and nothing downstream would report it, because a 1200x630
 * PNG of the right size is exactly what every check looks for.
 */
export function cardPalette(backgroundHex) {
  const luminance = relativeLuminance(backgroundHex)
  // 0.179 is the luminance at which dark and white text have equal WCAG
  // contrast; above it dark text reads better (e.g. a brand colour like #ff6900).
  const isLight = luminance !== null && luminance > 0.179

  const palette = isLight
    ? { title: '#0b1020', accent: '#0f766e', body: '#374151', footnote: '#4b5563' }
    : { title: '#ffffff', accent: '#5eead4', body: '#c7cbe0', footnote: '#9aa1c0' }

  // A mid-tone background can leave the softer colours below 3:1, the WCAG
  // minimum for large text; those fall back to the title colour.
  if (luminance === null) return palette
  return Object.fromEntries(
    Object.entries(palette).map(([key, hex]) => [
      key,
      contrastRatio(hex, backgroundHex) >= 3 ? hex : palette.title,
    ])
  )
}

/** WCAG contrast ratio of two `#rrggbb` colours. */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const el = React.createElement

export function cardElement(siteConfig, description) {
  const palette = cardPalette(siteConfig.themeColor)

  return el(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '72px 80px',
        backgroundColor: siteConfig.themeColor,
        color: palette.title,
      },
    },
    // A rule rather than a logo: the template ships no wordmark, and blowing
    // the 512px app icon up to card size is the artefact this card replaces.
    // A fork with a wordmark can swap this one element for an <img>.
    el('div', {
      style: { display: 'flex', width: 120, height: 10, backgroundColor: palette.accent },
    }),
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      el('div', { style: { display: 'flex', fontSize: 84, lineHeight: 1.05 } }, siteConfig.name),
      el(
        'div',
        { style: { display: 'flex', fontSize: 38, marginTop: 18, color: palette.accent } },
        siteConfig.tagline
      ),
      el(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 28,
            marginTop: 26,
            lineHeight: 1.4,
            color: palette.body,
          },
        },
        description
      )
    ),
    el(
      'div',
      { style: { display: 'flex', fontSize: 24, color: palette.footnote } },
      // No bare "EIN" while the EIN is empty (pending).
      `Supported by ${siteConfig.supportedBy.name}` +
        (siteConfig.ein.trim() ? ` · EIN ${siteConfig.ein.trim()}` : '')
    )
  )
}

/** Renders the card for the repo's siteConfig and returns the PNG bytes. */
export async function renderCard() {
  // Imported from the TypeScript source rather than duplicated: the card must
  // say what the site says, and a second copy of the brand strings is exactly
  // how the two drift apart. A file: URL, since import() rejects C:\ paths.
  const { siteConfig, cardDescription } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'lib', 'site.config.ts')).href
  )
  const response = new ImageResponse(cardElement(siteConfig, cardDescription()), {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  })
  const bytes = Buffer.from(await response.arrayBuffer())

  // The full 8-byte signature, not the `PNG` inside it: three ASCII letters
  // occur by accident in plenty of binary data, and this guard exists to stop
  // a non-PNG being written into public/, where it would next be noticed in a
  // browser rather than here. See scripts/png-signature.mjs.
  if (!isPng(bytes)) {
    throw new Error('ImageResponse did not return a PNG')
  }
  return bytes
}

// Guarded so the exports above can be imported by a test without rendering.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bytes = await renderCard()
  await writeFile(OUTPUT, bytes)
  console.log(
    `Wrote ${path.relative(ROOT, OUTPUT)} (${CARD_WIDTH}x${CARD_HEIGHT}, ${bytes.length} bytes)`
  )
}
