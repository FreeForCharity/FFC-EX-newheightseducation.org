import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import ThemeWidgets from '@/components/theme-widgets'
import { sharePageOf, shareNetworks } from '@/components/theme-widgets/share-all'

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
        <div class="woocommerce-product-gallery"><div class="woocommerce-product-gallery__wrapper">
          <div class="woocommerce-product-gallery__image" data-thumb="/1-100.webp"><a href="/1.webp"><img alt="One" src="/1-600.webp"></a></div>
          <div class="woocommerce-product-gallery__image" data-thumb="/2-100.webp"><a href="/2.webp"><img alt="Two" src="/2-600.webp"></a></div>
        </div></div>
        <div id="ss-floating-bar"><ul class="ss-social-icons-container">
          <li><a href="https://www.facebook.com/sharer.php?t=Why%20Junk&amp;u=https%3A%2F%2Fpublications.example.org%2Fwhy%2F" class="ss-facebook-color">f</a></li>
          <li><a href="https://twitter.com/intent/tweet?text=Why+Junk&amp;url=https%3A%2F%2Fpublications.example.org%2Fwhy%2F&amp;via=newheightseduc1" class="ss-twitter-color">x</a></li>
        </ul></div>
      </div>`
    view = render(<ThemeWidgets />)
  })

  let view: ReturnType<typeof render>

  it('removes what it built on unmount so a remount does not duplicate it', () => {
    view.unmount()
    expect(document.querySelectorAll('.flex-control-thumbs')).toHaveLength(0)
    expect(document.querySelector('.ffc-gallery-viewport')).toBeNull()
    expect(document.querySelector('.woocommerce-product-gallery__trigger')).toBeNull()
    expect(document.querySelector('.ss-share-all, dialog.ss-popup-overlay')).toBeNull()
    render(<ThemeWidgets />)
    expect(document.querySelectorAll('.ffc-gallery-thumb')).toHaveLength(2)
    expect(document.querySelectorAll('.ss-share-all')).toHaveLength(1)
  })

  it('opens and closes the share box as a labelled button', () => {
    const trigger = document.querySelector<HTMLElement>('.mk-toggle-trigger')!
    const box = document.querySelector<HTMLElement>('.single-share-box')!
    expect(trigger.getAttribute('role')).toBe('button')
    expect(trigger.getAttribute('aria-controls')).toBe(box.id)
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    trigger.dispatchEvent(space)
    expect(space.defaultPrevented).toBe(true)
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

  it('makes each WPBakery toggle question a button inside its heading', () => {
    const button = document.querySelector<HTMLElement>('.vc_toggle_title h3 > button')!
    expect(button.textContent).toBe('Q')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
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
    expect(slides[1].hasAttribute('inert')).toBe(false)
    expect(slides[0].hasAttribute('inert')).toBe(true)
    const wrapper = document.querySelector<HTMLElement>('.woocommerce-product-gallery__wrapper')!
    expect(wrapper.parentElement!.classList).toContain('ffc-gallery-viewport')
    expect(wrapper.style.transform).toBe('translate3d(-100%, 0, 0)')
  })

  it('opens the photo viewer at the current photo from the zoom button', () => {
    fireEvent.click(document.querySelectorAll<HTMLElement>('.ffc-gallery-thumb')[1])
    const zoom = document.querySelector<HTMLButtonElement>(
      'button.woocommerce-product-gallery__trigger'
    )!
    expect(zoom.getAttribute('aria-label')).toBe('View full-size image')
    zoom.focus()
    fireEvent.click(zoom)
    const dialog = document.querySelector<HTMLDialogElement>('dialog.ffc-lightbox')!
    expect(dialog.querySelector('img')!.getAttribute('src')).toMatch(/\/2\.webp$/)
    dialog.close()
    expect(document.activeElement).toBe(zoom)
  })

  it('adds the share-all button and its Share via popup', () => {
    jest.useFakeTimers()
    const more = document.querySelector<HTMLElement>('#ss-floating-bar .ss-share-all')!
    expect(more.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(more)
    const dialog = document.querySelector<HTMLDialogElement>('#ss-all-networks-popup')!
    expect(dialog.hasAttribute('open')).toBe(true)
    expect(dialog.closest('.ffc-clone')).not.toBeNull()
    expect(dialog.querySelector('.ss-popup-heading span')!.textContent).toBe('Share via')
    const labels = [...dialog.querySelectorAll('.ss-popup-network')].map((n) => n.textContent)
    expect(labels).toEqual(['Facebook', 'X (Twitter)', 'Mix', 'Email', 'Print', 'Copy Link'])
    fireEvent.click(dialog.querySelector<HTMLElement>('.ss-popup-copy a')!)
    const copy = document.querySelector<HTMLDialogElement>('#ss-copy-popup')!
    expect(copy.hasAttribute('open')).toBe(true)
    expect(copy.querySelector('input')!.value).toBe('https://publications.example.org/why/')
    copy.dispatchEvent(new Event('cancel', { cancelable: true }))
    jest.runAllTimers()
    expect(copy.hasAttribute('open')).toBe(false)
    expect(dialog.hasAttribute('open')).toBe(false)
    expect(document.activeElement).toBe(more)
    jest.useRealTimers()
  })
})

describe('share-all links', () => {
  it('reads the page from the bar and builds the live share links', () => {
    const bar = document.createElement('ul')
    bar.innerHTML =
      '<li><a class="ss-facebook-color" href="https://www.facebook.com/sharer.php?t=Why%20Junk%20Food&u=https%3A%2F%2Fpublications.example.org%2Fwhy%2F">f</a></li>' +
      '<li><a class="ss-linkedin-color" href="https://www.linkedin.com/shareArticle?title=Why&url=x&mini=true">in</a></li>'
    const page = sharePageOf(bar)!
    expect(page).toEqual({ url: 'https://publications.example.org/why/', title: 'Why Junk Food' })
    const links = Object.fromEntries(shareNetworks(page, bar).map((n) => [n.id, n.href]))
    expect(links.mix).toBe(
      'https://mix.com/add?url=https%3A%2F%2Fpublications.example.org%2Fwhy%2F'
    )
    expect(links.envelope).toBe(
      'mailto:?body=https%3A%2F%2Fpublications.example.org%2Fwhy%2F&subject=Why%20Junk%20Food'
    )
    expect(links.linkedin).toMatch(/^https:\/\/www\.linkedin\.com\/shareArticle/)
    expect('twitter' in links).toBe(false)
  })
})
