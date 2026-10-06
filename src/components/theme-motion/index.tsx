'use client'

import { useEffect } from 'react'

/**
 * The scroll behaviour the themes' scripts gave the live site (#106), measured
 * against it before it went offline: Jupiter and WPBakery scroll-in reveals,
 * WPBakery parallax backgrounds and their content fade, Jupiter's sticky
 * header shrink, and the Jupiter and Astra back-to-top buttons.
 *
 * Reveal, parallax and fade run only while `html.ffc-motion` is set (see
 * src/lib/motion-ready.ts), so without JavaScript or under reduced motion the
 * content shows and backgrounds stay still.
 */

export const GO_TOP_AFTER = 400
export const AST_TOP_AFTER = 300
/** WPBakery's waypoint fires when an element's top reaches 85% of the viewport. */
export const REVEAL_ROOT_MARGIN = '0px 0px -15% 0px'
/** Jupiter drops its scroll-in at this width and below, so content just shows. */
export const JUPITER_STILL_MAX = 1024

const clamp = (n: number) => Math.min(1, Math.max(0, n))

/**
 * WPBakery's skrollr keyframes: the layer, speed × the section's height, sits
 * at -(speed-1) × 100% when it enters below the fold and at 0 when it leaves
 * above it, linear in between.
 */
export function parallaxOffset(speed: number, height: number, top: number, vh: number) {
  const p = clamp((vh - top) / (vh + speed * height))
  return -(speed - 1) * height * (1 - p)
}

/** Jupiter's moving fade: opaque until the content's bottom is 30% down the viewport, gone at 5%. */
export function fadeOpacity(bottom: number, vh: number) {
  return clamp((bottom - 0.05 * vh) / (0.25 * vh))
}

type Teardown = () => void

function wireReveal(): Teardown | null {
  if (window.matchMedia?.(`(max-width: ${JUPITER_STILL_MAX}px)`).matches) {
    document
      .querySelectorAll('.ffc-clone .mk-animate-element')
      .forEach((el) => el.classList.remove('mk-animate-element'))
  }
  const targets = document.querySelectorAll<HTMLElement>(
    '.ffc-clone .mk-animate-element:not(.mk-in-viewport), .ffc-clone .wpb_animate_when_almost_visible:not(.wpb_start_animation)'
  )
  if (!targets.length) return null
  const reveal = (el: Element) =>
    el.classList.add(
      ...(el.classList.contains('mk-animate-element')
        ? ['mk-in-viewport']
        : ['wpb_start_animation', 'animated'])
    )
  if (typeof window.IntersectionObserver !== 'function') {
    targets.forEach(reveal)
    return null
  }
  const observer = new window.IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        reveal(entry.target)
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: REVEAL_ROOT_MARGIN }
  )
  targets.forEach((el) => observer.observe(el))
  return () => observer.disconnect()
}

interface Layer {
  section: HTMLElement
  inner: HTMLElement
  speed: number
}

function buildParallax(): Layer[] {
  const layers: Layer[] = []
  document.querySelectorAll<HTMLElement>('.ffc-clone [data-vc-parallax]').forEach((section) => {
    const speed = parseFloat(section.dataset.vcParallax ?? '')
    const image = getComputedStyle(section).backgroundImage
    if (!(speed > 1) || !image || image === 'none') return
    const inner = document.createElement('div')
    inner.className = 'vc_parallax-inner'
    inner.style.height = `${speed * 100}%`
    inner.style.backgroundImage = image
    section.prepend(inner)
    section.classList.add('ffc-parallax')
    layers.push({ section, inner, speed })
  })
  return layers
}

function buildFades(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>('.ffc-clone .vc_parallax-content-moving-fade'),
  ].flatMap((section) => {
    const grid = section.querySelector<HTMLElement>('.mk-grid')
    return grid ? [grid] : []
  })
}

interface Sticky {
  header: HTMLElement
  holder: HTMLElement
  threshold: number
}

function buildSticky(): Sticky[] {
  return [
    ...document.querySelectorAll<HTMLElement>('header.mk-header[data-sticky-style="fixed"]'),
  ].flatMap((header) => {
    const holder = header.querySelector<HTMLElement>('.mk-header-holder')
    if (!holder) return []
    const padding = header.querySelector<HTMLElement>('.mk-header-padding-wrapper')
    const threshold = padding?.offsetHeight || parseFloat(header.dataset.height ?? '') || 0
    header.style.setProperty(
      '--ffc-sticky-h',
      `${parseFloat(header.dataset.stickyHeight ?? '') || 55}px`
    )
    return [{ header, holder, threshold }]
  })
}

function setHidden(el: HTMLElement, hidden: boolean) {
  if (hidden) {
    el.setAttribute('tabindex', '-1')
    el.setAttribute('aria-hidden', 'true')
  } else {
    el.removeAttribute('tabindex')
    el.removeAttribute('aria-hidden')
  }
}

export default function ThemeMotion() {
  useEffect(() => {
    const root = document.documentElement
    const motion = root.classList.contains('ffc-motion')
    const teardowns: Teardown[] = []

    if (motion) {
      const off = wireReveal()
      if (off) teardowns.push(off)
    }
    const layers = motion ? buildParallax() : []
    const fades = motion ? buildFades() : []
    const stickies = buildSticky()
    const goTops = [...document.querySelectorAll<HTMLElement>('.ffc-clone .mk-go-top')]
    const astTop = document.querySelector<HTMLElement>('.ffc-clone #ast-scroll-top')
    if (astTop) {
      astTop.setAttribute('role', 'button')
      astTop.setAttribute('aria-label', 'Scroll to top')
    }

    const update = () => {
      const vh = window.innerHeight
      const y = window.scrollY
      for (const { section, inner, speed } of layers) {
        const r = section.getBoundingClientRect()
        if (r.bottom < -vh || r.top > 2 * vh) continue
        inner.style.transform = `translate3d(0, ${parallaxOffset(speed, r.height, r.top, vh)}px, 0)`
      }
      for (const grid of fades) {
        grid.style.opacity = String(fadeOpacity(grid.getBoundingClientRect().bottom, vh))
      }
      for (const { header, holder, threshold } of stickies) {
        const fixed = getComputedStyle(holder).position === 'fixed'
        header.classList.toggle('a-sticky', fixed && y > threshold)
      }
      for (const el of goTops) {
        const active = y > GO_TOP_AFTER
        el.classList.toggle('is-active', active)
        setHidden(el, !active)
      }
      if (astTop) astTop.style.display = y > AST_TOP_AFTER ? 'block' : 'none'
    }

    let frame = 0
    const schedule = () => {
      if (!frame)
        frame = window.requestAnimationFrame(() => {
          frame = 0
          update()
        })
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    const toTop = (event: Event) => {
      event.preventDefault()
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
      document.getElementById('main-content')?.focus({ preventScroll: true })
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest('.ffc-clone .mk-go-top, .ffc-clone #ast-scroll-top')) toTop(event)
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === astTop) toTop(event)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)

    root.setAttribute('data-ffc-motion-ready', '')
    return () => {
      teardowns.forEach((off) => off())
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      if (frame) window.cancelAnimationFrame(frame)
      for (const { section, inner } of layers) {
        inner.remove()
        section.classList.remove('ffc-parallax')
      }
      fades.forEach((grid) => (grid.style.opacity = ''))
    }
  }, [])

  return null
}
