'use client'

import { useEffect } from 'react'

/** Players that load only when asked for (#57, #62): Canva, Spreaker and Rumble. */
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
      const rumble = src.startsWith('https://rumble.com/embed/')
      if (!spreaker && !rumble && !src.startsWith('https://www.canva.com/')) return
      const frame = document.createElement('iframe')
      frame.src = src
      frame.title =
        button.dataset.ffcEmbedTitle ??
        (spreaker ? 'Spreaker episode' : rumble ? 'Rumble video' : 'Canva presentation')
      if (spreaker) {
        frame.className = 'ffc-embed-frame ffc-embed-frame--audio'
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups')
        const height = button.dataset.ffcEmbedHeight
        if (height && /^\d+px$/.test(height)) {
          frame.style.height = height
          frame.classList.add('ffc-embed-frame--inline')
        }
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
