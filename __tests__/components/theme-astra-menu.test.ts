import { wireAstraMenu } from '@/components/theme-widgets/astra-menu'

type Listener = () => void

function stubMedia(matches: boolean) {
  const listeners: Listener[] = []
  const media = {
    matches,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: () => {},
  }
  window.matchMedia = jest.fn().mockReturnValue(media)
  return {
    resize(next: boolean) {
      media.matches = next
      listeners.forEach((fn) => fn())
    },
  }
}

function buildHeader() {
  document.body.innerHTML = `
    <div class="ffc-clone ast-desktop">
      <header id="masthead">
        <div id="ast-mobile-header">
          <button class="menu-toggle main-header-menu-toggle" aria-expanded="false"></button>
          <div class="ast-mobile-header-content">
            <ul class="main-header-menu">
              <li class="menu-item"><a href="/a/">About</a></li>
              <li class="menu-item menu-item-has-children">
                <a href="/edguide/" aria-expanded="false">NHEG EDGuide<span class="dropdown-menu-toggle" aria-expanded="false"></span></a>
                <button class="ast-menu-toggle" aria-expanded="false"></button>
                <ul class="sub-menu"><li><a href="/2025/">2025 NHEG EDGuide</a></li></ul>
              </li>
            </ul>
          </div>
        </div>
      </header>
    </div>`
  return {
    root: document.querySelector('.ffc-clone') as HTMLElement,
    toggle: document.querySelector('.menu-toggle') as HTMLElement,
    item: document.querySelector('.menu-item-has-children') as HTMLElement,
    arrow: document.querySelector('.ast-menu-toggle') as HTMLElement,
    sub: document.querySelector('.sub-menu') as HTMLElement,
  }
}

describe('wireAstraMenu', () => {
  it('does nothing on a page without the Astra mobile header', () => {
    stubMedia(true)
    document.body.innerHTML = '<div class="ffc-clone"></div>'
    expect(wireAstraMenu()).toBeNull()
  })

  it('marks the root as live Astra does on each side of 922px', () => {
    const media = stubMedia(true)
    const { root } = buildHeader()
    wireAstraMenu()
    expect(root.classList.contains('ast-header-break-point')).toBe(true)
    expect(root.classList.contains('ast-desktop')).toBe(false)
    media.resize(false)
    expect(root.classList.contains('ast-header-break-point')).toBe(false)
    expect(root.classList.contains('ast-desktop')).toBe(true)
  })

  it('opens and closes the menu with the same state classes as live', () => {
    stubMedia(true)
    const { root, toggle } = buildHeader()
    wireAstraMenu()
    toggle.click()
    expect(root.classList.contains('ast-main-header-nav-open')).toBe(true)
    expect(toggle.classList.contains('toggled')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    toggle.click()
    expect(root.classList.contains('ast-main-header-nav-open')).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('expands a submenu from its arrow and folds it when the menu closes', () => {
    stubMedia(true)
    const { toggle, item, arrow, sub } = buildHeader()
    wireAstraMenu()
    toggle.click()
    arrow.click()
    expect(item.classList.contains('ast-submenu-expanded')).toBe(true)
    expect(arrow.getAttribute('aria-expanded')).toBe('true')
    expect(sub.style.display).toBe('block')
    expect(item.querySelector(':scope > a')!.getAttribute('aria-expanded')).toBe('true')
    expect(item.querySelector('.dropdown-menu-toggle')!.getAttribute('aria-expanded')).toBe('true')
    toggle.click()
    expect(item.classList.contains('ast-submenu-expanded')).toBe(false)
    expect(sub.style.display).toBe('none')
    expect(item.querySelector(':scope > a')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on Escape and returns focus to the hamburger', () => {
    stubMedia(true)
    const { root, toggle } = buildHeader()
    wireAstraMenu()
    toggle.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(root.classList.contains('ast-main-header-nav-open')).toBe(false)
    expect(document.activeElement).toBe(toggle)
  })

  it('closes an open menu when the window grows past the breakpoint', () => {
    const media = stubMedia(true)
    const { root, toggle } = buildHeader()
    wireAstraMenu()
    toggle.click()
    media.resize(false)
    expect(root.classList.contains('ast-main-header-nav-open')).toBe(false)
  })
})
