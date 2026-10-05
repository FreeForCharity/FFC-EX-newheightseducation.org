import {
  parseSwipeConfig,
  stepIndex,
  swipePerView,
  wireSliders,
} from '@/components/theme-widgets/sliders'
import reference from '../../tests/fixtures/live-motion-reference.json'

describe('slider helpers', () => {
  it('reads Jupiter swipe slideshow config', () => {
    expect(
      parseSwipeConfig(
        '{ "effect": "slide", "slidesPerView": "3", "displayTime": "7000", "transitionTime": "700", "nav": ".nav-4" }'
      )
    ).toEqual({ slidesPerView: 3, displayTime: 7000, transitionTime: 700, nav: '.nav-4' })
    expect(parseSwipeConfig('not json')).toBeNull()
    expect(parseSwipeConfig(null)).toBeNull()
  })

  it('matches the live slides per view at each width', () => {
    for (const [width, perView] of Object.entries(reference.sliders.storeSwipe.perView)) {
      expect(swipePerView(3, Number(width))).toBe(perView)
    }
    expect(swipePerView(4, 1440)).toBe(4)
    expect(swipePerView(4, 1024)).toBe(3)
  })

  it('steps one slide and wraps at either end', () => {
    expect(stepIndex(0, 1, 7, 3)).toBe(1)
    expect(stepIndex(4, 1, 7, 3)).toBe(0)
    expect(stepIndex(0, -1, 7, 3)).toBe(4)
    expect(stepIndex(0, 1, 2, 4)).toBe(0)
  })
})

describe('wireSliders', () => {
  const original = window.matchMedia
  const reduce = (matches: boolean) => {
    window.matchMedia = jest.fn().mockReturnValue({ matches }) as never
  }
  beforeEach(() => {
    jest.useFakeTimers()
    reduce(false)
  })
  afterEach(() => {
    jest.useRealTimers()
    window.matchMedia = original
  })

  it('fades the flexslider on its interval and labels its controls', () => {
    document.body.innerHTML = `
      <div class="ffc-clone">
        <div class="wpb_flexslider flexslider" data-interval="3">
          <ul class="slides"><li><img alt=""></li><li><img alt=""></li></ul>
        </div>
      </div>`
    const off = wireSliders()
    const slides = document.querySelectorAll('.slides > li')
    expect(slides[0].classList).toContain('flex-active-slide')
    expect(slides[1].hasAttribute('inert')).toBe(true)
    jest.advanceTimersByTime(3000)
    expect(slides[1].classList).toContain('flex-active-slide')
    expect(document.querySelector('.flex-next')!.getAttribute('aria-label')).toBe('Next slide')
    const pause = document.querySelector<HTMLButtonElement>('.ffc-slider-pause')!
    pause.click()
    jest.advanceTimersByTime(6000)
    expect(slides[1].classList).toContain('flex-active-slide')
    expect(pause.getAttribute('aria-label')).toBe('Play slideshow')
    off()
  })

  it('removes its controls on teardown so a rewire does not duplicate them', () => {
    document.body.innerHTML = `
      <div class="ffc-clone">
        <div class="wpb_flexslider flexslider" data-interval="3">
          <ul class="slides"><li></li><li></li></ul>
        </div>
      </div>`
    wireSliders()()
    expect(document.querySelector('.flex-control-paging')).toBeNull()
    expect(document.querySelector('.slides > li[inert]')).toBeNull()
    const off = wireSliders()
    expect(document.querySelectorAll('.flex-control-paging')).toHaveLength(1)
    expect(document.querySelectorAll('.ffc-slider-pause')).toHaveLength(1)
    off()
  })

  const swipe = () => {
    document.body.innerHTML = `
      <div class="ffc-clone">
        <div class="swiper-navigation nav-4">
          <a class="swiper-arrows" data-direction="prev"></a>
          <a class="swiper-arrows" data-direction="next"></a>
        </div>
        <div data-mk-component="SwipeSlideshow" data-swipeSlideshow-config='{"slidesPerView":"1","displayTime":"7000","transitionTime":"700","nav":".nav-4"}'>
          <div class="mk-slider-holder"><div><a href="#a">a</a></div><div><a href="#b">b</a></div><div>c</div></div>
        </div>
      </div>`
    Object.assign(window, { innerWidth: 1440 })
    return wireSliders()
  }
  const holder = () => document.querySelector<HTMLElement>('.mk-slider-holder')!.style.transform

  it('stays paused while a slide keeps focus after the pointer leaves', () => {
    const off = swipe()
    const root = document.querySelector<HTMLElement>('[data-mk-component]')!
    const link = root.querySelector<HTMLElement>('a')!
    root.dispatchEvent(new MouseEvent('mouseenter'))
    link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    root.dispatchEvent(new MouseEvent('mouseleave'))
    jest.advanceTimersByTime(7000)
    expect(holder()).toBe('translateX(0%)')
    off()
  })

  it('stays paused while the pointer stays after focus leaves', () => {
    const off = swipe()
    const root = document.querySelector<HTMLElement>('[data-mk-component]')!
    const link = root.querySelector<HTMLElement>('a')!
    link.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    root.dispatchEvent(new MouseEvent('mouseenter'))
    link.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    jest.advanceTimersByTime(7000)
    expect(holder()).toBe('translateX(0%)')
    root.dispatchEvent(new MouseEvent('mouseleave'))
    jest.advanceTimersByTime(7000)
    expect(holder()).toBe('translateX(-100%)')
    off()
  })

  it('pauses while the store arrows outside the slideshow are hovered', () => {
    const off = swipe()
    const nav = document.querySelector<HTMLElement>('.nav-4')!
    nav.dispatchEvent(new MouseEvent('mouseenter'))
    jest.advanceTimersByTime(14000)
    expect(holder()).toBe('translateX(0%)')
    nav.dispatchEvent(new MouseEvent('mouseleave'))
    jest.advanceTimersByTime(7000)
    expect(holder()).toBe('translateX(-100%)')
    off()
  })

  it('does not autoplay under reduced motion', () => {
    reduce(true)
    document.body.innerHTML = `
      <div class="ffc-clone">
        <div class="wpb_flexslider flexslider" data-interval="3">
          <ul class="slides"><li></li><li></li></ul>
        </div>
      </div>`
    const off = wireSliders()
    jest.advanceTimersByTime(9000)
    expect(document.querySelectorAll('.slides > li')[0].classList).toContain('flex-active-slide')
    expect(document.querySelector('.ffc-slider-pause')).toBeNull()
    off()
  })
})
