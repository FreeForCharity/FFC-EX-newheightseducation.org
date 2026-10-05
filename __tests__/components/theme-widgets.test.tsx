import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import ThemeWidgets from '@/components/theme-widgets'

describe('ThemeWidgets', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    })
    document.body.innerHTML = `
      <div class="ffc-clone">
        <div class="blog-share-container">
          <div class="blog-single-share mk-toggle-trigger"><svg></svg></div>
          <ul class="single-share-box mk-box-to-trigger"><li><a href="https://x.com">x</a></li></ul>
        </div>
        <a class="mk-lightbox" title="Civic" href="/a.webp">&nbsp;</a>
        <div class="vc_toggle"><div class="vc_toggle_title"><h3>Q</h3></div><div class="vc_toggle_content">A</div></div>
        <div class="woocommerce-tabs">
          <ul class="tabs">
            <li><a href="#tab-description">Description</a></li>
            <li><a href="#tab-reviews">Reviews</a></li>
          </ul>
          <div class="woocommerce-Tabs-panel" id="tab-description">D</div>
          <div class="woocommerce-Tabs-panel" id="tab-reviews">R</div>
        </div>
        <div class="woocommerce-product-gallery">
          <div class="woocommerce-product-gallery__image" data-thumb="/1-100.webp"><a href="/1.webp"><img alt="One" src="/1-600.webp"></a></div>
          <div class="woocommerce-product-gallery__image" data-thumb="/2-100.webp"><a href="/2.webp"><img alt="Two" src="/2-600.webp"></a></div>
        </div>
      </div>`
    view = render(<ThemeWidgets />)
  })

  let view: ReturnType<typeof render>

  it('removes what it built on unmount so a remount does not duplicate it', () => {
    view.unmount()
    expect(document.querySelectorAll('.flex-control-thumbs')).toHaveLength(0)
    render(<ThemeWidgets />)
    expect(document.querySelectorAll('.ffc-gallery-thumb')).toHaveLength(2)
  })

  it('opens and closes the share box as a labelled button', () => {
    const trigger = document.querySelector<HTMLElement>('.mk-toggle-trigger')!
    const box = document.querySelector<HTMLElement>('.single-share-box')!
    expect(trigger.getAttribute('role')).toBe('button')
    expect(trigger.getAttribute('aria-controls')).toBe(box.id)
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(box.style.display).toBe('block')
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows a lightbox image instead of leaving the page', () => {
    const link = document.querySelector<HTMLAnchorElement>('a.mk-lightbox')!
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
    const dialog = document.querySelector<HTMLDialogElement>('dialog.ffc-lightbox')!
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(dialog.querySelector('img')!.getAttribute('src')).toMatch(/\/a\.webp$/)
    expect(dialog.querySelector('figcaption')!.textContent).toBe('Civic')
  })

  it('toggles WPBakery toggles from the keyboard', () => {
    const title = document.querySelector<HTMLElement>('.vc_toggle_title')!
    fireEvent.keyDown(title, { key: 'Enter' })
    expect(title.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.vc_toggle')!.classList).toContain('vc_toggle_active')
  })

  it('makes the product tabs a tablist with one panel shown', () => {
    const [first, second] = document.querySelectorAll<HTMLElement>('a[role="tab"]')
    const panels = document.querySelectorAll<HTMLElement>('.woocommerce-Tabs-panel')
    expect(first.getAttribute('aria-selected')).toBe('true')
    expect(panels[1].hidden).toBe(true)
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(panels[0].hidden).toBe(true)
    expect(panels[1].hidden).toBe(false)
  })

  it('adds gallery thumbnails that switch the photo', () => {
    const thumbs = document.querySelectorAll<HTMLElement>('.ffc-gallery-thumb')
    expect(thumbs).toHaveLength(2)
    fireEvent.click(thumbs[1])
    const slides = document.querySelectorAll('.woocommerce-product-gallery__image')
    expect(slides[1].classList).toContain('ffc-current')
    expect(slides[0].classList).not.toContain('ffc-current')
  })
})
