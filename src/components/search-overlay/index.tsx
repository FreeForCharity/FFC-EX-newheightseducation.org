'use client'

import { useEffect } from 'react'

/**
 * Opens the theme's own search field from the header icon (#49). The icons
 * link to /search/, so search works without JavaScript; this upgrades them
 * to Jupiter's fullscreen overlay and Astra's slide-out field, both of which
 * submit to the same page.
 */
const OVERLAY_OPEN = 'mk-fullscreen-search-overlay-show'
const ASTRA_OPEN = 'ast-dropdown-active'

export default function SearchOverlay() {
  useEffect(() => {
    let returnFocus: HTMLElement | null = null

    const overlay = () => document.querySelector<HTMLElement>('.mk-fullscreen-search-overlay')

    const close = () => {
      const el = overlay()
      if (!el?.classList.contains(OVERLAY_OPEN)) return false
      el.classList.remove(OVERLAY_OPEN)
      document
        .querySelectorAll('.mk-fullscreen-trigger')
        .forEach((t) => t.setAttribute('aria-expanded', 'false'))
      returnFocus?.focus()
      return true
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      const trigger = target?.closest<HTMLElement>('.mk-fullscreen-trigger')
      const el = overlay()
      if (trigger && el) {
        event.preventDefault()
        returnFocus = trigger
        el.classList.add(OVERLAY_OPEN)
        trigger.setAttribute('aria-expanded', 'true')
        const input = el.querySelector<HTMLInputElement>('#mk-fullscreen-search-input')
        // The theme fades the overlay in; focus lands once it is visible.
        let tries = 0
        const focus = () => {
          input?.focus()
          if (input && document.activeElement !== input && ++tries < 20)
            window.setTimeout(focus, 25)
        }
        focus()
        return
      }
      if (target?.closest('.mk-fullscreen-close')) {
        event.preventDefault()
        close()
        return
      }
      const astra = target?.closest<HTMLElement>('.ast-search-icon .astra-search-icon')
      const menu = astra?.closest('.ast-search-menu-icon')
      if (astra && menu) {
        event.preventDefault()
        const open = !menu.classList.contains(ASTRA_OPEN)
        menu.classList.toggle(ASTRA_OPEN, open)
        astra.setAttribute('aria-expanded', String(open))
        const field = menu.querySelector<HTMLInputElement>('.search-field')
        if (field) {
          field.tabIndex = open ? 0 : -1
          if (open) field.focus()
        }
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && close()) event.preventDefault()
      if (event.key !== 'Escape') return
      const menu = document.querySelector<HTMLElement>(`.ast-search-menu-icon.${ASTRA_OPEN}`)
      if (menu) {
        menu.classList.remove(ASTRA_OPEN)
        const icon = menu.querySelector<HTMLElement>('.astra-search-icon')
        icon?.setAttribute('aria-expanded', 'false')
        const field = menu.querySelector<HTMLInputElement>('.search-field')
        if (field) field.tabIndex = -1
        icon?.focus()
      }
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return null
}
