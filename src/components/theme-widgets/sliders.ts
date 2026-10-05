/**
 * The slideshows the themes built in JavaScript (#106), measured against the
 * live site: WPBakery's flexslider (fade, `data-interval` seconds), Jupiter's
 * swipe slideshow (its JSON config, one per view below 768px) and WPBakery's
 * logo carousel (manual). Autoplay pauses on hover, focus, a hidden tab and
 * the pause button, and never starts under reduced motion.
 */

type Teardown = () => void

export const PHONE_MAX = 767
export const TABLET_MAX = 1140

/** Jupiter's swipe slideshow: one per view on phones, at most three on tablets. */
export function swipePerView(configured: number, width: number) {
  if (width <= PHONE_MAX) return 1
  if (width <= TABLET_MAX) return Math.min(configured, 3)
  return configured
}

export interface SwipeConfig {
  slidesPerView: number
  displayTime: number
  transitionTime: number
  nav?: string
}

export function parseSwipeConfig(raw: string | null): SwipeConfig | null {
  if (!raw) return null
  try {
    const c = JSON.parse(raw)
    return {
      slidesPerView: Math.max(1, Number(c.slidesPerView) || 1),
      displayTime: Number(c.displayTime) || 0,
      transitionTime: Number(c.transitionTime) || 0,
      nav: typeof c.nav === 'string' ? c.nav : undefined,
    }
  } catch {
    return null
  }
}

/** Next first-visible index, wrapping at either end. */
export function stepIndex(index: number, by: number, count: number, perView: number) {
  const last = Math.max(0, count - perView)
  const next = index + by
  if (next > last) return 0
  if (next < 0) return last
  return next
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

let signal: AbortSignal | undefined

function asControl(el: HTMLElement, label: string, onActivate: () => void) {
  el.setAttribute('role', 'button')
  el.setAttribute('tabindex', '0')
  el.setAttribute('aria-label', label)
  el.removeAttribute('href')
  el.addEventListener(
    'click',
    (e) => {
      e.preventDefault()
      onActivate()
    },
    { signal }
  )
  el.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
    { signal }
  )
}

interface Engine {
  root: HTMLElement
  count: number
  perView: () => number
  render: (index: number) => void
  interval: number
  /** Controls outside the root, such as the store's arrows, that also pause it. */
  extra?: HTMLElement[]
}

function run(engine: Engine): Teardown {
  const { root, count, perView, render, interval } = engine
  const scope = [root, ...(engine.extra ?? [])]
  let index = 0
  let timer = 0
  let paused = false
  const hovered = new Set<HTMLElement>()
  let focused = false
  let pauseButton: HTMLButtonElement | null = null

  const draw = () => {
    render(index)
    if (pauseButton) pauseButton.hidden = count <= perView()
  }
  const go = (by: number) => {
    index = stepIndex(index, by, count, perView())
    draw()
  }
  const stop = () => {
    window.clearInterval(timer)
    timer = 0
  }
  const start = () => {
    stop()
    if (!interval || paused || hovered.size || focused || document.hidden || reducedMotion()) return
    timer = window.setInterval(() => go(1), interval)
  }
  if (interval && !reducedMotion()) {
    pauseButton = document.createElement('button')
    pauseButton.type = 'button'
    pauseButton.className = 'ffc-slider-pause'
    const label = () => {
      pauseButton!.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow')
      pauseButton!.textContent = paused ? '▶' : '❚❚'
    }
    label()
    pauseButton.addEventListener('click', () => {
      paused = !paused
      label()
      root.setAttribute('aria-live', paused ? 'polite' : 'off')
      start()
    })
    root.append(pauseButton)
  }
  const listeners = new AbortController()
  const on = { signal: listeners.signal }
  const inScope = (node: Node | null) => !!node && scope.some((el) => el.contains(node))
  for (const el of scope) {
    el.addEventListener(
      'mouseenter',
      () => {
        hovered.add(el)
        stop()
      },
      on
    )
    el.addEventListener(
      'mouseleave',
      () => {
        hovered.delete(el)
        start()
      },
      on
    )
    el.addEventListener(
      'focusin',
      () => {
        focused = true
        stop()
      },
      on
    )
    el.addEventListener(
      'focusout',
      (e) => {
        if (inScope(e.relatedTarget as Node | null)) return
        focused = false
        start()
      },
      on
    )
  }
  root.setAttribute('aria-live', 'off')
  document.addEventListener('visibilitychange', start)
  const onResize = () => go(0)
  window.addEventListener('resize', onResize)
  draw()
  start()
  ;(root as HTMLElement & { ffcGo?: (by: number) => void }).ffcGo = go
  return () => {
    stop()
    listeners.abort()
    document.removeEventListener('visibilitychange', start)
    window.removeEventListener('resize', onResize)
    pauseButton?.remove()
  }
}

const go = (root: HTMLElement, by: number) =>
  (root as HTMLElement & { ffcGo?: (by: number) => void }).ffcGo?.(by)

function labelSlides(root: HTMLElement, slides: HTMLElement[], name: string) {
  root.setAttribute('role', 'region')
  root.setAttribute('aria-roledescription', 'carousel')
  root.setAttribute('aria-label', name)
  slides.forEach((slide, i) => {
    slide.setAttribute('role', 'group')
    slide.setAttribute('aria-roledescription', 'slide')
    slide.setAttribute('aria-label', `${i + 1} of ${slides.length}`)
  })
}

const resetSlides = (slides: HTMLElement[]) =>
  slides.forEach((slide) => {
    slide.removeAttribute('inert')
    slide.removeAttribute('aria-hidden')
    slide.classList.remove('flex-active-slide')
  })

const setShown = (slide: HTMLElement, shown: boolean) => {
  slide.toggleAttribute('inert', !shown)
  if (shown) slide.removeAttribute('aria-hidden')
  else slide.setAttribute('aria-hidden', 'true')
}

function wireFlexslider(root: HTMLElement): Teardown | null {
  const list = root.querySelector<HTMLElement>(':scope > ul.slides')
  const slides = list ? [...list.querySelectorAll<HTMLElement>(':scope > li')] : []
  if (!slides.length) return null
  root.classList.add('ffc-slider-fade')
  list!.setAttribute('role', 'presentation')
  labelSlides(root, slides, 'Gallery')
  const paging = document.createElement('ol')
  paging.className = 'flex-control-nav flex-control-paging'
  const dots = slides.map((_, i) => {
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.textContent = String(i + 1)
    asControl(a, `Show slide ${i + 1}`, () => go(root, i - current))
    li.append(a)
    paging.append(li)
    return a
  })
  const direction = document.createElement('ul')
  direction.className = 'flex-direction-nav'
  for (const [cls, label, by] of [
    ['flex-prev', 'Previous slide', -1],
    ['flex-next', 'Next slide', 1],
  ] as const) {
    const li = document.createElement('li')
    li.className = `flex-nav-${cls.slice(5)}`
    const a = document.createElement('a')
    a.className = cls
    a.textContent = cls === 'flex-prev' ? 'Previous' : 'Next'
    asControl(a, label, () => go(root, by))
    li.append(a)
    direction.append(li)
  }
  if (slides.length > 1) root.append(paging, direction)
  let current = 0
  const stop = run({
    root,
    count: slides.length,
    perView: () => 1,
    interval: (Number(root.dataset.interval) || 0) * 1000,
    render: (index) => {
      current = index
      slides.forEach((slide, i) => {
        slide.classList.toggle('flex-active-slide', i === index)
        setShown(slide, i === index)
      })
      dots.forEach((dot, i) => {
        dot.classList.toggle('flex-active', i === index)
        if (i === index) dot.setAttribute('aria-current', 'true')
        else dot.removeAttribute('aria-current')
      })
    },
  })
  return () => {
    stop()
    paging.remove()
    direction.remove()
    root.classList.remove('ffc-slider-fade')
    list!.removeAttribute('role')
    resetSlides(slides)
  }
}

function wireSwipe(root: HTMLElement): Teardown | null {
  const config = parseSwipeConfig(root.getAttribute('data-swipeSlideshow-config'))
  const holder = root.querySelector<HTMLElement>('.mk-slider-holder')
  const slides = holder ? [...holder.querySelectorAll<HTMLElement>(':scope > div')] : []
  if (!config || !holder || !slides.length) return null
  root.classList.add('ffc-slider-swipe')
  holder.style.transitionDuration = `${config.transitionTime}ms`
  labelSlides(root, slides, 'Products')
  holder.addEventListener('load', () => go(root, 0), { capture: true, signal })
  const perView = () => swipePerView(config.slidesPerView, window.innerWidth)
  const nav = config.nav ? document.querySelector<HTMLElement>(config.nav) : null
  const arrows = nav ? [...nav.querySelectorAll<HTMLElement>('.swiper-arrows')] : []
  arrows.forEach((arrow) => {
    const prev = arrow.dataset.direction === 'prev'
    asControl(arrow, prev ? 'Previous products' : 'Next products', () => go(root, prev ? -1 : 1))
  })
  const stop = run({
    root,
    count: slides.length,
    perView,
    interval: slides.length > 1 ? config.displayTime : 0,
    extra: nav ? [nav] : [],
    render: (index) => {
      const view = perView()
      root.style.setProperty('--ffc-per-view', String(view))
      holder.style.transform = `translateX(${(-100 * index) / view}%)`
      const shown = slides.filter((_, i) => i >= index && i < index + view)
      slides.forEach((slide) => setShown(slide, shown.includes(slide)))
      holder.style.height = `${shown[0].scrollHeight}px`
      arrows.forEach((a) => (a.hidden = slides.length <= view))
    },
  })
  return () => {
    stop()
    root.classList.remove('ffc-slider-swipe')
    holder.style.transform = ''
    holder.style.height = ''
    holder.style.transitionDuration = ''
    arrows.forEach((a) => (a.hidden = false))
    resetSlides(slides)
  }
}

function wireLogoStrip(root: HTMLElement): Teardown | null {
  const strip = root.querySelector<HTMLElement>('.vc_carousel-slideline-inner')
  if (!strip) return null
  root.classList.add('ffc-logo-strip')
  root.querySelectorAll<HTMLElement>('.vc_carousel-control').forEach((control) => {
    const prev = control.classList.contains('vc_left')
    asControl(control, prev ? 'Previous logos' : 'Next logos', () =>
      strip.scrollBy({
        left: (prev ? -1 : 1) * strip.clientWidth,
        behavior: reducedMotion() ? 'auto' : 'smooth',
      })
    )
  })
  return () => root.classList.remove('ffc-logo-strip')
}

export function wireSliders(): Teardown {
  const controller = new AbortController()
  signal = controller.signal
  const teardowns: Teardown[] = [() => controller.abort()]
  const add = (off: Teardown | null) => off && teardowns.push(off)
  document
    .querySelectorAll<HTMLElement>('.ffc-clone .wpb_flexslider')
    .forEach((el) => add(wireFlexslider(el)))
  document
    .querySelectorAll<HTMLElement>('.ffc-clone [data-mk-component="SwipeSlideshow"]')
    .forEach((el) => add(wireSwipe(el)))
  document
    .querySelectorAll<HTMLElement>('.ffc-clone .vc_images_carousel')
    .forEach((el) => add(wireLogoStrip(el)))
  return () => teardowns.forEach((off) => off())
}
