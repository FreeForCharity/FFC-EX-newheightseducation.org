import React from 'react'
import { render, act, fireEvent } from '@testing-library/react'
import ThemeMotion, {
  parallaxOffset,
  fadeOpacity,
  GO_TOP_AFTER,
  AST_TOP_AFTER,
} from '@/components/theme-motion'
import reference from '../../tests/fixtures/live-motion-reference.json'

describe('parallaxOffset', () => {
  it('matches the live home parallax at 1440 (section at 61px, 839px tall)', () => {
    const live = reference.parallax.home.topPercentAtScroll['1440']
    for (const [y, top] of Object.entries(live)) {
      const offset = parallaxOffset(1.5, 839, 61 - Number(y), 900)
      expect((offset / 839) * 100).toBeCloseTo(top, 0)
    }
  })

  it('rests at -(speed-1) below the fold and 0 above it', () => {
    expect(parallaxOffset(2, 500, 2000, 900)).toBe(-500)
    expect(parallaxOffset(2, 500, -2000, 900)).toBe(-0)
  })
})

describe('fadeOpacity', () => {
  it('is opaque until the content bottom is 30% down and gone at 5%', () => {
    expect(fadeOpacity(400, 900)).toBe(1)
    expect(fadeOpacity(270, 900)).toBeCloseTo(1)
    expect(fadeOpacity(157.5, 900)).toBeCloseTo(0.5)
    expect(fadeOpacity(45, 900)).toBe(0)
  })
})

describe('ThemeMotion', () => {
  const scrollTo = (y: number) => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    act(() => {
      jest.runOnlyPendingTimers()
    })
  }

  beforeEach(() => {
    jest.useFakeTimers()
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => setTimeout(() => cb(0), 0) as unknown as number)
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-ffc-motion-ready')
    document.body.innerHTML = `
      <main id="main-content" tabindex="-1"></main>
      <div class="ffc-clone">
        <div class="mk-animate-element fade-in">hero</div>
        <div class="wpb_animate_when_almost_visible">button</div>
        <section data-vc-parallax="1.5" style="background-image: url(a.jpg)"><div class="mk-grid">x</div></section>
        <a href="#top-of-page" class="mk-go-top">top</a>
        <div id="ast-scroll-top" tabindex="0" style="display:none"></div>
      </div>`
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    window.scrollTo = jest.fn()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('reveals, adds the parallax layer and reports ready when motion is on', () => {
    const observer = window.IntersectionObserver
    Object.assign(window, { IntersectionObserver: undefined })
    document.documentElement.classList.add('ffc-motion')
    render(<ThemeMotion />)
    expect(document.querySelector('.mk-animate-element')!.classList).toContain('mk-in-viewport')
    expect(document.querySelector('.wpb_animate_when_almost_visible')!.classList).toContain(
      'wpb_start_animation'
    )
    const inner = document.querySelector<HTMLElement>('section .vc_parallax-inner')!
    expect(inner.style.height).toBe('150%')
    expect(document.querySelector('section')!.classList).toContain('ffc-parallax')
    expect(document.documentElement.hasAttribute('data-ffc-motion-ready')).toBe(true)
    Object.assign(window, { IntersectionObserver: observer })
  })

  it('removes its parallax layer on unmount so a remount can rebuild it', () => {
    document.documentElement.classList.add('ffc-motion')
    const first = render(<ThemeMotion />)
    first.unmount()
    expect(document.querySelector('.vc_parallax-inner')).toBeNull()
    expect(document.querySelector('section')!.classList).not.toContain('ffc-parallax')
    render(<ThemeMotion />)
    expect(document.querySelectorAll('.vc_parallax-inner')).toHaveLength(1)
  })

  it('leaves content and backgrounds alone without html.ffc-motion', () => {
    render(<ThemeMotion />)
    expect(document.querySelector('.vc_parallax-inner')).toBeNull()
    expect(document.querySelector('.mk-animate-element')!.classList).not.toContain('mk-in-viewport')
  })

  it('shows both back-to-top buttons past their live thresholds', () => {
    render(<ThemeMotion />)
    const go = document.querySelector<HTMLElement>('.mk-go-top')!
    const ast = document.querySelector<HTMLElement>('#ast-scroll-top')!
    expect(go.getAttribute('aria-hidden')).toBe('true')
    scrollTo(AST_TOP_AFTER + 1)
    expect(ast.style.display).toBe('block')
    expect(go.classList).not.toContain('is-active')
    scrollTo(GO_TOP_AFTER + 1)
    expect(go.classList).toContain('is-active')
    expect(go.hasAttribute('aria-hidden')).toBe(false)
    scrollTo(0)
    expect(ast.style.display).toBe('none')
  })

  it('scrolls to the top and moves focus from the keyboard', () => {
    render(<ThemeMotion />)
    const ast = document.querySelector<HTMLElement>('#ast-scroll-top')!
    expect(ast.getAttribute('role')).toBe('button')
    fireEvent.keyDown(ast, { key: 'Enter' })
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }))
    expect(document.activeElement?.id).toBe('main-content')
  })
})
