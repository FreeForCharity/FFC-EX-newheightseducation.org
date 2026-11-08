'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import manifest from '@/data/flipbook-pages.json'
import './flipbook.css'

type Issue = { pages: number; aspect: number }
const REPO = 'FreeForCharity/FFC-EX-newheightseducation.org'
const issues = manifest.issues as Record<string, Issue>

/** Page image URLs for an issue, on jsDelivr pinned to the images' commit. */
export function pageUrls(slug: string, count: number, commit = manifest.commit) {
  const base = `https://cdn.jsdelivr.net/gh/${REPO}@${commit}/${slug}/`
  return Array.from({ length: count }, (_, i) => {
    const n = String(i + 1).padStart(3, '0')
    return { lo: `${base}${n}-lo.webp`, hi: `${base}${n}-hi.webp`, th: `${base}${n}-th.webp` }
  })
}
/** The same file on raw.githubusercontent.com, if jsDelivr fails. */
export const rawFallback = (url: string) =>
  url.replace(`https://cdn.jsdelivr.net/gh/${REPO}@`, `https://raw.githubusercontent.com/${REPO}/`)

function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/**
 * On a publication issue page, replaces the cover-and-PDF-link block with the
 * page-turning viewer. The block stays as it is when the issue has no page
 * images or the browser has no WebGL, so the PDF link always works.
 */
export default function Flipbook() {
  const pathname = usePathname()
  useEffect(() => {
    const slug = pathname.match(/\/publications\/books\/([^/]+)\/?$/)?.[1]
    const issue = slug ? issues[slug] : undefined
    const figure = document.querySelector<HTMLElement>('figure.ffc-flipbook')
    if (!slug || !issue || !figure || !webglAvailable()) return
    let book: { destroy?: () => void } | undefined
    let cancelled = false
    const holder = document.createElement('div')
    holder.className = 'ffc-flipbook-viewer'
    import('./engine.js').then(({ Flipbook: Viewer }) => {
      if (cancelled) return
      const link = figure.querySelector<HTMLAnchorElement>('a[href]')
      figure.replaceWith(holder)
      book = new Viewer(holder, {
        pages: pageUrls(slug, issue.pages),
        aspect: issue.aspect,
        title: document.title,
        pdf: link?.href ?? '',
        fallback: rawFallback,
      })
    })
    return () => {
      cancelled = true
      book?.destroy?.()
    }
  }, [pathname])
  return null
}
