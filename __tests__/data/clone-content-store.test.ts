/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')
const STORE = 'https://nheg.givebacks.com/store?category=NHEG%20Products'

function fragments(dir = CONTENT_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return fragments(full)
    return entry.name.endsWith('.html') ? [full] : []
  })
}
const all = fragments().map((file) => ({
  page: path.relative(CONTENT_DIR, file),
  html: fs.readFileSync(file, 'utf8'),
}))
const read = (page: string) => fs.readFileSync(path.join(CONTENT_DIR, `${page}.html`), 'utf8')
const offenders = (re: RegExp) => all.filter(({ html }) => re.test(html)).map(({ page }) => page)

// The store is a read-only catalog that sends buyers to NHEG's GiveBacks
// store (#54).
describe('store catalog', () => {
  const products = all.filter(({ page }) => page.startsWith('product/'))

  it('has its product pages', () => {
    expect(products).toHaveLength(94)
  })

  it('sends every product to the GiveBacks store, and keeps its price', () => {
    const wrong = products.filter(
      ({ html }) =>
        !html.includes(`class="ffc-store-button" href="${STORE}"`) ||
        !/woocommerce-Price-amount/.test(html) ||
        html.includes('ffc-contact-fallback')
    )
    expect(wrong.map(({ page }) => page)).toEqual([])
  })

  it('has no cart, checkout or account links, cart icons or login-only review form', () => {
    expect(offenders(/href="%%BASE%%\/(?:cart|checkout|my-account|donor-dashboard-2)\//)).toEqual(
      []
    )
    expect(
      offenders(/mk-shoping-cart-link|shopping-cart-header|add-cart-responsive-state/)
    ).toEqual([])
    expect(offenders(/class="must-log-in"/)).toEqual([])
    expect(
      all.filter(({ page, html }) => page.startsWith('product/') && html.includes('id="respond"'))
    ).toEqual([])
  })

  it('leaves no empty dropdown menu behind', () => {
    expect(offenders(/<ul\b[^>]*class="sub-menu\s*"[^>]*>\s*<\/ul>/)).toEqual([])
  })

  it('keeps the comment box on articles', () => {
    expect(read('publications/nheg-edguide-september-october-2026')).toContain('id="respond"')
  })

  it('labels every listing button as viewing the product, with no cart affordance', () => {
    expect(offenders(/Select options|mk-moon-cart-plus|add_to_cart_button/)).toEqual([])
    const buttons = all.flatMap(({ html }) =>
      [...html.matchAll(/<span class="product_loop_button_text">([^<]*)/g)].map((m) => m[1])
    )
    expect(buttons.length).toBeGreaterThan(400)
    expect([...new Set(buttons)]).toEqual(['View product'])
  })

  it('links the GiveBacks store directly, not through the old MemberHub domain', () => {
    expect(offenders(/href="https?:\/\/nheg\.memberhub\.(?:com|gives)/)).toEqual([])
  })

  it.each(['cart', 'my-account', 'donor-dashboard-2'])('has no %s route', (route) => {
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'app', route))).toBe(false)
    expect(fs.existsSync(path.join(CONTENT_DIR, `${route}.html`))).toBe(false)
  })
})
