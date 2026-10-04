'use client'

import { useEffect } from 'react'

/** Swaps a deferred embed's button for its iframe when pressed (#57). */
export default function EmbedFacade() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        'button.ffc-embed-facade'
      )
      const src = button?.dataset.ffcEmbed
      if (!button || !src?.startsWith('https://www.canva.com/')) return
      const frame = document.createElement('iframe')
      frame.src = src
      frame.title = button.dataset.ffcEmbedTitle ?? 'Canva presentation'
      frame.allow = 'fullscreen'
      frame.allowFullscreen = true
      frame.className = 'ffc-embed-frame'
      button.replaceWith(frame)
      frame.focus()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
