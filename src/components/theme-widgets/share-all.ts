/**
 * SocialSnap's "More" button and its "Share via" and "Copy link" popups (#106).
 * Live built them in JavaScript, so the export lost them; this rebuilds the
 * live markup in the plugin's own classes, as modal dialogs.
 */
import { SHARE_ICONS } from './share-icons'

type Teardown = () => void

export interface SharePage {
  url: string
  title: string
}

export interface ShareNetwork {
  id: string
  label: string
  href?: string
}

/** The page a bar shares, read back from its Facebook link as SocialSnap wrote it. */
export function sharePageOf(container: Element): SharePage | null {
  const link = container.querySelector<HTMLAnchorElement>('a[href*="facebook.com/sharer"]')
  if (!link) return null
  const params = new URL(link.href).searchParams
  const url = params.get('u')
  return url ? { url, title: params.get('t') ?? '' } : null
}

/** The live popup's networks, in its order. Facebook, X and LinkedIn reuse the bar's own links. */
export function shareNetworks(page: SharePage, bar: Element): ShareNetwork[] {
  const own = (id: string) => bar.querySelector<HTMLAnchorElement>(`a.ss-${id}-color`)?.href
  const url = encodeURIComponent(page.url)
  const title = encodeURIComponent(page.title)
  return [
    { id: 'facebook', label: 'Facebook', href: own('facebook') },
    { id: 'twitter', label: 'X (Twitter)', href: own('twitter') },
    { id: 'linkedin', label: 'LinkedIn', href: own('linkedin') },
    { id: 'mix', label: 'Mix', href: `https://mix.com/add?url=${url}` },
    { id: 'envelope', label: 'Email', href: `mailto:?body=${url}&subject=${title}` },
    { id: 'print', label: 'Print' },
    { id: 'copy', label: 'Copy Link' },
  ].filter((n) => n.href !== undefined || n.id === 'print' || n.id === 'copy')
}

const SVG = 'http://www.w3.org/2000/svg'

function icon(name: string) {
  const { viewBox, paths } = SHARE_ICONS[name]
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'ss-svg-icon')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('viewBox', viewBox)
  const [w, h] = viewBox.split(' ').slice(2)
  svg.setAttribute('width', w)
  svg.setAttribute('height', h)
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

/** An `a` the plugin's CSS styles, working as a button. */
function actionLink(className: string, label: string, onActivate: () => void, signal: AbortSignal) {
  const a = el('a', className)
  a.href = '#'
  a.setAttribute('role', 'button')
  a.setAttribute('aria-label', label)
  a.addEventListener(
    'click',
    (e) => {
      e.preventDefault()
      onActivate()
    },
    { signal }
  )
  a.addEventListener(
    'keydown',
    (e) => {
      if (e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
    { signal }
  )
  return a
}

let uid = 0

function popup(id: string, heading: string, signal: AbortSignal, onClose: () => void) {
  const dialog = el('dialog', 'ss-popup-overlay ffc-share-dialog')
  dialog.id = id
  const headingId = `${id}-heading-${++uid}`
  dialog.setAttribute('aria-labelledby', headingId)
  const box = el('div', 'ss-popup')
  const head = el('div', 'ss-popup-heading')
  const title = el('span', '', heading)
  title.id = headingId
  const close = el('button', 'ss-close-modal')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close')
  close.append(icon('close'))
  close.addEventListener('click', onClose, { signal })
  head.append(title, close)
  const content = el('div', 'ss-popup-content')
  box.append(head, content)
  dialog.append(box)
  dialog.addEventListener(
    'cancel',
    (e) => {
      e.preventDefault()
      onClose()
    },
    { signal }
  )
  dialog.addEventListener(
    'click',
    (e) => {
      if (e.target === dialog) onClose()
    },
    { signal }
  )
  return { dialog, content }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function show(dialog: HTMLDialogElement) {
  dialog.classList.remove('ss-hide-popup', 'ss-remove-visible')
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
  dialog.classList.add('ss-visible')
  window.requestAnimationFrame(() => dialog.classList.add('ss-animate-popup'))
}

function hide(dialog: HTMLDialogElement, done: () => void) {
  if (!dialog.open) return done()
  dialog.classList.add('ss-hide-popup', 'ss-remove-visible')
  window.setTimeout(
    () => {
      dialog.classList.remove(
        'ss-visible',
        'ss-animate-popup',
        'ss-hide-popup',
        'ss-remove-visible'
      )
      dialog.close()
      done()
    },
    reducedMotion() ? 0 : 300
  )
}

export function wireShareAll(): Teardown {
  const bars = [...document.querySelectorAll<HTMLElement>('.ffc-clone .ss-social-icons-container')]
    .map((bar) => ({ bar, page: sharePageOf(bar) }))
    .filter(
      (b): b is { bar: HTMLElement; page: SharePage } =>
        !!b.page && !b.bar.querySelector('.ss-share-all')
    )
  const root = document.querySelector('.ffc-clone')
  if (!bars.length || !root) return () => {}

  const controller = new AbortController()
  const { signal } = controller
  let opener: HTMLElement | null = null
  let page: SharePage = bars[0].page

  const closeAll = () =>
    hide(copy.dialog, () =>
      hide(all.dialog, () => {
        opener?.focus()
        opener = null
      })
    )
  const all = popup('ss-all-networks-popup', 'Share via', signal, closeAll)
  const copy = popup('ss-copy-popup', 'Copy link', signal, closeAll)
  copy.dialog.classList.add('ss-copy-visible')

  const field = el('input', 'ss-copy-action-field')
  field.type = 'text'
  field.readOnly = true
  field.setAttribute('aria-label', 'Link to this page')
  const copyButton = el('button', 'ss-button', 'Copy')
  copyButton.type = 'button'
  const copied = el('span', 'ss-share-network-tooltip', 'Copied')
  copied.setAttribute('role', 'status')
  copyButton.append(copied)
  copyButton.addEventListener(
    'click',
    () => {
      field.select()
      const ok = () => copyButton.classList.add('ss-visible-tooltip')
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(page.url).then(ok, () => {})
      else if (document.execCommand?.('copy')) ok()
    },
    { signal }
  )
  const action = el('div', 'ss-copy-action')
  action.append(field, copyButton, icon('copy'))
  copy.content.append(action)

  const networks = el('div', 'ss-popup-networks ss-clearfix')
  all.content.append(networks)

  const fill = (bar: HTMLElement) => {
    networks.replaceChildren(
      ...shareNetworks(page, bar).map((network) => {
        const item = el('div', `ss-popup-network ss-popup-${network.id}`)
        const className = `ss-${network.id}-color`
        let link: HTMLAnchorElement
        if (network.id === 'print') {
          link = actionLink(className, network.label, () => window.print(), signal)
        } else if (network.id === 'copy') {
          link = actionLink(
            className,
            network.label,
            () => {
              field.value = page.url
              copyButton.classList.remove('ss-visible-tooltip')
              show(copy.dialog)
              copyButton.focus()
            },
            signal
          )
        } else {
          link = el('a', className)
          link.href = network.href!
          link.setAttribute('aria-label', network.label)
          if (!link.href.startsWith('mailto:')) link.target = '_blank'
          link.rel = 'nofollow noopener'
        }
        const iconWrap = el('span')
        iconWrap.append(icon(network.id))
        link.append(iconWrap, el('span', '', network.label))
        item.append(link)
        return item
      })
    )
  }

  const added: HTMLElement[] = []
  for (const { bar, page: barPage } of bars) {
    const floating = !!bar.closest('#ss-floating-bar')
    const li = el('li')
    const more = actionLink(
      'ss-share-all ss-shareall-color',
      'More share options',
      () => {
        opener = more
        page = barPage
        fill(bar)
        show(all.dialog)
        networks.querySelector<HTMLElement>('a')?.focus()
      },
      signal
    )
    more.setAttribute('aria-haspopup', 'dialog')
    const content = el('span', 'ss-share-network-content')
    const i = el('i', 'ss-network-icon')
    i.append(icon('plus'))
    content.append(i)
    if (!floating && bar.querySelector('.ss-network-label')) {
      content.append(el('span', 'ss-network-label', 'More'))
    }
    more.append(content)
    li.append(more)
    if (floating) li.append(el('span', 'ss-share-network-tooltip', 'More Networks'))
    bar.append(li)
    added.push(li)
  }
  root.append(all.dialog, copy.dialog)

  return () => {
    controller.abort()
    added.forEach((li) => li.remove())
    all.dialog.remove()
    copy.dialog.remove()
  }
}
