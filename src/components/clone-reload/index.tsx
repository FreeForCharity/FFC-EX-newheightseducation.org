'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { CLONE_MARKER } from '@/lib/clone-marker'

/**
 * A client-side navigation renders a clone route from its RSC payload, which
 * carries only the marker; the fragment is in the page's HTML (#43). Reload
 * to fetch it.
 */
export default function CloneReload() {
  const pathname = usePathname()
  useEffect(() => {
    const clone = document.querySelector('.ffc-clone')
    if (clone?.innerHTML.trim().startsWith(`<!--${CLONE_MARKER}`)) window.location.reload()
  }, [pathname])
  return null
}
