'use client'

import { useEffect } from 'react'

/**
 * The click behaviour the themes' scripts gave the live site (#106): Jupiter's
 * blog share box and image lightbox, WooCommerce's product tabs and gallery,
 * and WPBakery's toggles. Without JavaScript the links still go to the image
 * and every tab panel stays readable.
 */

type Teardown = () => void

let uid = 0
const idFor = (el: HTMLElement, prefix: string) => {
  if (!el.id) el.id = `${prefix}-${++uid}`
  return el.id
}

function asButton(el: HTMLElement, label?: string) {
  if (el.tagName !== 'BUTTON' && el.tagName !== 'A') {
    el.setAttribute('role', 'button')
    el.setAttribute('tabindex', '0')
  }
  if (label) el.setAttribute('aria-label', label)
}

function wireShareBoxes() {
  document.querySelectorAll<HTMLElement>('.ffc-clone .mk-toggle-trigger').forEach((trigger) => {
    const box = trigger.parentElement?.querySelector<HTMLElement>('.mk-box-to-trigger')
    if (!box) return
    asButton(trigger, 'Share')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.setAttribute('aria-controls', idFor(box, 'ffc-share'))
  })
}

function setShare(trigger: HTMLElement, open: boolean) {
  const box = document.getElementById(trigger.getAttribute('aria-controls') ?? '')
  if (!box) return
  trigger.classList.toggle('mk-toggle-active', open)
  trigger.setAttribute('aria-expanded', String(open))
  box.style.display = open ? 'block' : ''
}

function wireToggles() {
  document.querySelectorAll<HTMLElement>('.ffc-clone .vc_toggle_title').forEach((title) => {
    const content = title.parentElement?.querySelector<HTMLElement>('.vc_toggle_content')
    if (!content) return
    if (title.querySelector('.ffc-toggle-button')) return
    const heading = title.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6') ?? title
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'ffc-toggle-button'
    button.append(...heading.childNodes)
    heading.append(button)
    button.setAttribute('aria-controls', idFor(content, 'ffc-toggle'))
    button.setAttribute(
      'aria-expanded',
      String(!!title.closest('.vc_toggle')?.classList.contains('vc_toggle_active'))
    )
  })
}

function setToggle(button: HTMLElement, open: boolean) {
  const content = document.getElementById(button.getAttribute('aria-controls') ?? '')
  button.closest('.vc_toggle')?.classList.toggle('vc_toggle_active', open)
  button.setAttribute('aria-expanded', String(open))
  if (content) content.style.display = open ? 'block' : 'none'
}

function wireTabs() {
  document.querySelectorAll<HTMLElement>('.ffc-clone .woocommerce-tabs').forEach((wrapper) => {
    const list = wrapper.querySelector<HTMLElement>('ul.tabs')
    const links = [...wrapper.querySelectorAll<HTMLAnchorElement>('ul.tabs a[href^="#tab-"]')]
    if (!list || !links.length) return
    list.setAttribute('role', 'tablist')
    links.forEach((link) => {
      const panel = wrapper.querySelector<HTMLElement>(link.getAttribute('href')!)
      link.setAttribute('role', 'tab')
      link.id ||= idFor(link, 'ffc-tab')
      link.parentElement?.setAttribute('role', 'presentation')
      if (panel) {
        link.setAttribute('aria-controls', panel.id)
        panel.setAttribute('role', 'tabpanel')
        panel.setAttribute('aria-labelledby', link.id)
        panel.setAttribute('tabindex', '0')
      }
    })
    const fromHash = links.find((l) => l.getAttribute('href') === window.location.hash)
    selectTab(fromHash ?? links[0], false)
  })
}

function selectTab(tab: HTMLAnchorElement, focus: boolean) {
  const wrapper = tab.closest('.woocommerce-tabs')
  if (!wrapper) return
  wrapper.querySelectorAll<HTMLAnchorElement>('ul.tabs a[role="tab"]').forEach((link) => {
    const active = link === tab
    link.setAttribute('aria-selected', String(active))
    link.setAttribute('tabindex', active ? '0' : '-1')
    link.parentElement?.classList.toggle('active', active)
    const panel = document.getElementById(link.getAttribute('aria-controls') ?? '')
    if (panel) panel.hidden = !active
  })
  if (focus) tab.focus()
}

function wireGalleries(): Teardown {
  const built: HTMLElement[] = []
  document
    .querySelectorAll<HTMLElement>('.ffc-clone .woocommerce-product-gallery')
    .forEach((gallery) => {
      const slides = [
        ...gallery.querySelectorAll<HTMLElement>('.woocommerce-product-gallery__image'),
      ]
      if (!slides.length) return
      gallery.classList.add('ffc-gallery')
      slides[0].classList.add('ffc-current')
      if (slides.length < 2) return
      const thumbs = document.createElement('ol')
      thumbs.className = 'flex-control-nav flex-control-thumbs'
      slides.forEach((slide, i) => {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'ffc-gallery-thumb'
        button.setAttribute('aria-label', `Show image ${i + 1} of ${slides.length}`)
        button.dataset.ffcSlide = String(i)
        if (i === 0) button.setAttribute('aria-current', 'true')
        const img = document.createElement('img')
        img.src = slide.dataset.thumb ?? slide.querySelector('img')?.src ?? ''
        img.alt = ''
        img.width = 100
        img.height = 100
        if (i === 0) img.className = 'flex-active'
        button.append(img)
        item.append(button)
        thumbs.append(item)
      })
      gallery.append(thumbs)
      built.push(thumbs)
    })
  return () => {
    built.forEach((el) => el.remove())
    document.querySelectorAll('.ffc-gallery').forEach((g) => g.classList.remove('ffc-gallery'))
    document
      .querySelectorAll('.ffc-current')
      .forEach((slide) => slide.classList.remove('ffc-current'))
  }
}

function showSlide(button: HTMLElement) {
  const gallery = button.closest('.woocommerce-product-gallery')
  if (!gallery) return
  const index = Number(button.dataset.ffcSlide)
  gallery.querySelectorAll('.woocommerce-product-gallery__image').forEach((slide, i) => {
    slide.classList.toggle('ffc-current', i === index)
  })
  gallery.querySelectorAll<HTMLElement>('.ffc-gallery-thumb').forEach((thumb, i) => {
    if (i === index) thumb.setAttribute('aria-current', 'true')
    else thumb.removeAttribute('aria-current')
    thumb.querySelector('img')?.classList.toggle('flex-active', i === index)
  })
}

interface Picture {
  src: string
  caption: string
}

function lightbox(): { open: (items: Picture[], index: number, opener: HTMLElement) => void } & {
  teardown: Teardown
} {
  let dialog: HTMLDialogElement | null = null
  let items: Picture[] = []
  let index = 0
  let opener: HTMLElement | null = null
  let img: HTMLImageElement
  let caption: HTMLElement
  let prev: HTMLButtonElement
  let next: HTMLButtonElement
  let count: HTMLElement

  const show = () => {
    const item = items[index]
    img.src = item.src
    img.alt = item.caption
    caption.textContent = item.caption
    const many = items.length > 1
    prev.hidden = next.hidden = count.hidden = !many
    count.textContent = many ? `${index + 1} / ${items.length}` : ''
  }
  const step = (by: number) => {
    if (items.length < 2) return
    index = (index + by + items.length) % items.length
    show()
  }
  const button = (className: string, label: string, text: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = className
    b.setAttribute('aria-label', label)
    b.textContent = text
    b.addEventListener('click', onClick)
    return b
  }
  const build = () => {
    dialog = document.createElement('dialog')
    dialog.className = 'ffc-lightbox'
    dialog.setAttribute('aria-label', 'Image viewer')
    const figure = document.createElement('figure')
    img = document.createElement('img')
    caption = document.createElement('figcaption')
    count = document.createElement('p')
    count.className = 'ffc-lightbox__count'
    figure.append(img, caption)
    prev = button('ffc-lightbox__prev', 'Previous image', '‹', () => step(-1))
    next = button('ffc-lightbox__next', 'Next image', '›', () => step(1))
    const close = button('ffc-lightbox__close', 'Close', '×', () => dialog?.close())
    dialog.append(close, figure, prev, next, count)
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog?.close()
    })
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    })
    dialog.addEventListener('close', () => opener?.focus())
    document.body.append(dialog)
    return dialog
  }
  return {
    open(list, at, from) {
      items = list
      index = at
      opener = from
      const d = dialog ?? build()
      show()
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    },
    teardown() {
      dialog?.remove()
    },
  }
}

const pictureOf = (link: HTMLAnchorElement): Picture => ({
  src: link.href,
  caption:
    link.title ||
    link.querySelector('img')?.alt ||
    link.parentElement?.querySelector('img')?.alt ||
    '',
})

export default function ThemeWidgets() {
  useEffect(() => {
    wireShareBoxes()
    wireToggles()
    wireTabs()
    const offGalleries = wireGalleries()
    const viewer = lightbox()

    const onActivate = (event: Event) => {
      const target = event.target as Element | null
      if (!target) return
      const share = target.closest<HTMLElement>('.ffc-clone .mk-toggle-trigger[aria-controls]')
      if (share) {
        event.preventDefault()
        setShare(share, share.getAttribute('aria-expanded') !== 'true')
        return
      }
      const title = target
        .closest<HTMLElement>('.ffc-clone .vc_toggle_title')
        ?.querySelector<HTMLElement>('.ffc-toggle-button')
      if (title) {
        event.preventDefault()
        setToggle(title, title.getAttribute('aria-expanded') !== 'true')
        return
      }
      const tab = target.closest<HTMLAnchorElement>('.ffc-clone a[role="tab"]')
      if (tab) {
        event.preventDefault()
        selectTab(tab, false)
        return
      }
      const thumb = target.closest<HTMLElement>('.ffc-gallery-thumb')
      if (thumb) {
        showSlide(thumb)
        return
      }
      const product = target.closest<HTMLAnchorElement>(
        '.ffc-clone .woocommerce-product-gallery__image a'
      )
      if (product) {
        event.preventDefault()
        const links = [
          ...product
            .closest('.woocommerce-product-gallery')!
            .querySelectorAll<HTMLAnchorElement>('.woocommerce-product-gallery__image a'),
        ]
        viewer.open(links.map(pictureOf), links.indexOf(product), product)
        return
      }
      const link = target.closest<HTMLAnchorElement>('.ffc-clone a.mk-lightbox')
      if (link) {
        event.preventDefault()
        viewer.open([pictureOf(link)], 0, link)
      }
    }

    const onClick = (event: MouseEvent) => {
      onActivate(event)
      const target = event.target as Element | null
      document
        .querySelectorAll<HTMLElement>('.ffc-clone .mk-toggle-trigger[aria-expanded="true"]')
        .forEach((open) => {
          const box = document.getElementById(open.getAttribute('aria-controls') ?? '')
          if (!open.contains(target) && !box?.contains(target)) setShare(open, false)
        })
    }

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (event.key === 'Escape') {
        const open = document.querySelector<HTMLElement>(
          '.ffc-clone .mk-toggle-trigger[aria-expanded="true"]'
        )
        if (open) {
          setShare(open, false)
          open.focus()
        }
        return
      }
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        target.getAttribute('role') === 'button' &&
        target.matches('.mk-toggle-trigger')
      ) {
        event.preventDefault()
        onActivate(event)
        return
      }
      if (target.getAttribute('role') === 'tab') {
        const tabs = [
          ...(target
            .closest('[role="tablist"]')
            ?.querySelectorAll<HTMLAnchorElement>('a[role="tab"]') ?? []),
        ]
        const at = tabs.indexOf(target as HTMLAnchorElement)
        const to =
          event.key === 'ArrowRight'
            ? (at + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (at - 1 + tabs.length) % tabs.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : -1
        if (to >= 0) {
          event.preventDefault()
          selectTab(tabs[to], true)
        }
      }
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      viewer.teardown()
      offGalleries()
    }
  }, [])

  return null
}
