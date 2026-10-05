'use client'

import { useEffect } from 'react'

/** Players that load only when asked for (#57): Canva and Spreaker. */
const SPREAKER = 'https://widget.spreaker.com/'

/** Swaps a deferred embed's button for its iframe when pressed. */
export default function EmbedFacade() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
        'button.ffc-embed-facade'
      )
      const src = button?.dataset.ffcEmbed
      if (!button || !src) return
      const spreaker = src.startsWith(SPREAKER)
      if (!spreaker && !src.startsWith('https://www.canva.com/')) return
      const frame = document.createElement('iframe')
      frame.src = src
      frame.title =
        button.dataset.ffcEmbedTitle ?? (spreaker ? 'Spreaker episode' : 'Canva presentation')
      if (spreaker) {
        frame.className = 'ffc-embed-frame ffc-embed-frame--audio'
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
        const height = button.dataset.ffcEmbedHeight
        if (height && /^\d+px$/.test(height)) frame.style.height = height
      } else {
        frame.className = 'ffc-embed-frame'
        frame.allow = 'fullscreen'
        frame.allowFullscreen = true
      }
      button.replaceWith(frame)
      frame.focus()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
