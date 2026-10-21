/**
 * Astra's phone and tablet header on the publications pages. Live, the theme's
 * script marks the body `ast-header-break-point` below 922px, the hamburger
 * adds `ast-main-header-nav-open`, and each arrow expands its submenu; the
 * theme's stylesheet does the rest.
 */
type Teardown = () => void

const BREAKPOINT = '(max-width: 921px)'

export function wireAstraMenu(): Teardown | null {
  const toggle = document.querySelector<HTMLElement>('.ffc-clone #ast-mobile-header .menu-toggle')
  const root = toggle?.closest<HTMLElement>('.ffc-clone')
  if (!toggle || !root) return null
  const header = toggle.closest('#ast-mobile-header')!
  const arrows = [
    ...header.querySelectorAll<HTMLElement>('.menu-item-has-children > .ast-menu-toggle'),
  ]

  const setSub = (arrow: HTMLElement, open: boolean) => {
    const item = arrow.parentElement!
    const sub = item.querySelector<HTMLElement>(':scope > .sub-menu')
    item.classList.toggle('ast-submenu-expanded', open)
    item
      .querySelectorAll(':scope > a, :scope > a .dropdown-menu-toggle')
      .forEach((el) => el.setAttribute('aria-expanded', String(open)))
    arrow.setAttribute('aria-expanded', String(open))
    if (sub) sub.style.display = open ? 'block' : 'none'
  }
  const setOpen = (open: boolean) => {
    root.classList.toggle('ast-main-header-nav-open', open)
    toggle.classList.toggle('toggled', open)
    toggle.setAttribute('aria-expanded', String(open))
    arrows.forEach((arrow) => setSub(arrow, false))
  }

  const media = window.matchMedia(BREAKPOINT)
  const fit = () => {
    root.classList.toggle('ast-header-break-point', media.matches)
    root.classList.toggle('ast-desktop', !media.matches)
    if (!media.matches && root.classList.contains('ast-main-header-nav-open')) setOpen(false)
  }
  fit()
  media.addEventListener('change', fit)

  const onToggle = (event: Event) => {
    event.preventDefault()
    setOpen(!root.classList.contains('ast-main-header-nav-open'))
  }
  const onArrow = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    const arrow = event.currentTarget as HTMLElement
    setSub(arrow, arrow.getAttribute('aria-expanded') !== 'true')
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !root.classList.contains('ast-main-header-nav-open')) return
    setOpen(false)
    toggle.focus()
  }
  toggle.addEventListener('click', onToggle)
  arrows.forEach((arrow) => arrow.addEventListener('click', onArrow))
  document.addEventListener('keydown', onKey)

  return () => {
    media.removeEventListener('change', fit)
    toggle.removeEventListener('click', onToggle)
    arrows.forEach((arrow) => arrow.removeEventListener('click', onArrow))
    document.removeEventListener('keydown', onKey)
  }
}
