'use client'

import { useEffect } from 'react'

/**
 * The footer's "Translate" control (#49). Google Translate receives the page
 * text and may set cookies, so its script loads only after the visitor
 * chooses it, and only when they open the control. The choice is remembered.
 */
export const CONSENT_KEY = 'ffc-translate'
export const TRANSLATE_SRC =
  'https://translate.google.com/translate_a/element.js?cb=ffcTranslateInit'
const PANEL_ID = 'ffc-translate-panel'

type TranslateElement = new (options: Record<string, unknown>, id: string) => unknown

declare global {
  interface Window {
    ffcTranslateInit?: () => void
    google?: { translate?: { TranslateElement?: TranslateElement } }
  }
}

const consented = () => {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === 'granted'
  } catch {
    return false
  }
}

const remember = () => {
  try {
    window.localStorage.setItem(CONSENT_KEY, 'granted')
  } catch {
    // Private windows can refuse storage; the choice then lasts this page.
  }
}

let loading = false

function loadTranslate() {
  if (loading) return
  loading = true
  window.ffcTranslateInit = () => {
    const Element = window.google?.translate?.TranslateElement
    if (Element)
      new Element({ pageLanguage: 'en', autoDisplay: false }, 'google_language_translator')
  }
  const script = document.createElement('script')
  script.src = TRANSLATE_SRC
  document.body.appendChild(script)
}

/** Picks a language in Google's own control, once it has rendered. */
function choose(lang: string, tries = 40) {
  const select = document.querySelector<HTMLSelectElement>('select.goog-te-combo')
  if (!select) {
    if (tries > 0) window.setTimeout(() => choose(lang, tries - 1), 250)
    return
  }
  select.value = lang
  select.dispatchEvent(new Event('change'))
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  return node
}

export default function Translate() {
  useEffect(() => {
    const trigger = document.getElementById('glt-translate-trigger')
    const flags = document.getElementById('flags')
    if (!trigger || !flags) return

    const panel = el('div')
    panel.id = PANEL_ID
    panel.className = 'ffc-translate-panel'
    panel.hidden = true
    trigger.after(panel)

    trigger.setAttribute('role', 'button')
    trigger.setAttribute('tabindex', '0')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.setAttribute('aria-controls', PANEL_ID)

    flags.querySelectorAll<HTMLAnchorElement>('a.nturl').forEach((a) => {
      a.setAttribute('aria-label', `Translate into ${a.title}`)
      a.setAttribute('role', 'button')
    })

    const showFlags = () => {
      panel.replaceChildren(flags)
      flags.style.display = 'block'
      loadTranslate()
    }

    const askFirst = () => {
      const note = el(
        'p',
        'Translation uses Google Translate. Google receives the text of this page and may set cookies.'
      )
      const accept = el('button', 'Use Google Translate')
      accept.type = 'button'
      accept.className = 'ffc-translate-accept'
      accept.addEventListener('click', () => {
        remember()
        showFlags()
        flags.querySelector<HTMLElement>('a.nturl')?.focus()
      })
      const policy = el('a', 'Cookie policy')
      policy.href = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/cookie-policy/`
      panel.replaceChildren(note, accept, policy)
    }

    const setOpen = (open: boolean) => {
      panel.hidden = !open
      trigger.setAttribute('aria-expanded', String(open))
      if (!open) return
      if (consented()) showFlags()
      else askFirst()
    }

    const onTrigger = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      setOpen(panel.hidden)
    }
    const onFlagKey = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      const a = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.nturl')
      if (!a) return
      event.preventDefault()
      a.click()
    }
    const onFlag = (event: MouseEvent) => {
      const a = (event.target as Element | null)?.closest<HTMLAnchorElement>('a.nturl')
      if (!a) return
      event.preventDefault()
      const lang = [...a.classList].find((c) => /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(c))
      if (lang) choose(lang)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !panel.hidden) {
        setOpen(false)
        trigger.focus()
      }
    }

    trigger.addEventListener('click', onTrigger)
    trigger.addEventListener('keydown', onTrigger)
    flags.addEventListener('click', onFlag)
    flags.addEventListener('keydown', onFlagKey)
    document.addEventListener('keydown', onKey)
    return () => {
      trigger.removeEventListener('click', onTrigger)
      trigger.removeEventListener('keydown', onTrigger)
      flags.removeEventListener('click', onFlag)
      flags.removeEventListener('keydown', onFlagKey)
      document.removeEventListener('keydown', onKey)
      panel.remove()
    }
  }, [])
  return null
}
