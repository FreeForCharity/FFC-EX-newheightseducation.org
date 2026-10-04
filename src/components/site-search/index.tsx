'use client'

import { useEffect } from 'react'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

type PagefindUIInstance = { triggerSearch: (term: string) => void }

declare global {
  interface Window {
    PagefindUI?: new (options: Record<string, unknown>) => PagefindUIInstance
  }
}

/**
 * Mounts Pagefind's search UI on /search/ (#49). The index is built from
 * `out/` after the export, so it exists only in a production build.
 */
export default function SiteSearch() {
  useEffect(() => {
    const target = document.getElementById('ffc-search')
    if (!target) return
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = `${basePath}/pagefind/pagefind-ui.css`
    const script = document.createElement('script')
    script.src = `${basePath}/pagefind/pagefind-ui.js`
    script.onload = () => {
      if (!window.PagefindUI) return
      const ui = new window.PagefindUI({
        element: '#ffc-search',
        baseUrl: `${basePath}/`,
        showSubResults: true,
        showImages: false,
        autofocus: true,
      })
      const term = new URLSearchParams(window.location.search).get('s')
      if (term) ui.triggerSearch(term)
    }
    script.onerror = () => {
      target.textContent = 'Search is not available right now.'
    }
    document.head.appendChild(css)
    document.body.appendChild(script)
    return () => {
      css.remove()
      script.remove()
    }
  }, [])
  return null
}
