/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'

const CONTENT_DIR = path.join(process.cwd(), 'src', 'clone-content')
const read = (page: string) => fs.readFileSync(path.join(CONTENT_DIR, `${page}.html`), 'utf8')

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

// The live site's PayPal hosted buttons that still work (#55), with the exact
// fields the live forms submitted.
const BUTTONS: Record<string, string> = {
  'who-we-are/nheg-edguide': 'U8YWFU9M4TQVY',
  'school/students/school-senior-pictures': 'RH2HKX6TVNNKA',
}
const FIELDS: Record<string, { on0: string; options: [string, string][] }> = {
  'who-we-are/nheg-edguide': {
    on0: 'Magazine Ad',
    options: [
      ['1/2 page/2 issues', '1/2 page/2 issues $20.00 USD'],
      ['Full page/2 issues', 'Full page/2 issues $30.00 USD'],
      ['1/2 page/4 issues', '1/2 page/4 issues $36.00 USD'],
      ['Full page/4 issues', 'Full page/4 issues $54.00 USD'],
      ['1/2 page/6 issues', '1/2 page/6 issues $48.00 USD'],
      ['Full page/6 issues', 'Full page/6 issues $72.00 USD'],
    ],
  },
  'school/students/school-senior-pictures': {
    on0: 'Payment',
    options: [
      ['Deposit', 'Deposit $50.00 USD'],
      ['Remainder', 'Remainder $100.00 USD'],
    ],
  },
}
const paypalForm = (html: string) =>
  html.match(/<form class="ffc-paypal"[\s\S]*?<\/form>/)?.[0] ?? ''
const ZEFFY = 'https://www.zeffy.com/donation-form/48e1112a-8e9f-4c73-8b19-0caa89669ff5'

describe('payment paths', () => {
  it.each(Object.entries(BUTTONS))('%s has its PayPal button back', (page, id) => {
    const html = read(page)
    expect(html).toMatch(
      /<form class="ffc-paypal" action="https:\/\/www\.paypal\.com\/cgi-bin\/webscr"/
    )
    expect(html).toContain(`name="hosted_button_id" value="${id}"`)
    expect(html).toContain('name="cmd" value="_s-xclick"')
  })

  it('posts only to the reviewed PayPal buttons', () => {
    const forms = all.flatMap(({ page, html }) =>
      [...html.matchAll(/<form[^>]*paypal\.com[\s\S]*?<\/form>/g)].map((m) => ({
        page,
        id: m[0].match(/hosted_button_id" value="([^"]+)"/)?.[1],
      }))
    )
    const byPage = (a: { page: string }, b: { page: string }) => a.page.localeCompare(b.page)
    expect(forms.sort(byPage)).toEqual(
      Object.entries(BUTTONS)
        .map(([page, id]) => ({ page: `${page}.html`, id }))
        .sort(byPage)
    )
  })

  it('closes the expired 2017 offers', () => {
    expect(read('nheg-news/disney-park-hopper-tickets-raffle')).toContain(
      'This raffle ended on October 31, 2017.'
    )
    expect(read('nheg-news/nheg-writing-contest')).toContain(
      'Entries for this contest closed on September 30, 2017.'
    )
  })

  it.each(['nheg-educational-programs/nheg-tutoring-program', 'school/students/nheg-yearbook'])(
    '%s, whose button is broken on the live site, points to the contact page',
    (page) => {
      expect(read(page)).toMatch(
        /<a href="%%BASE%%\/contact-us\/">Contact us<\/a> to arrange payment/
      )
    }
  )

  it.each(['school/donation-history', 'support-nheg/giving-tuesday-november-27-2018'])(
    '%s sends GiveWP donors to Zeffy',
    (page) => {
      expect(read(page)).toContain(`class="mk-button ffc-zeffy-button" href="${ZEFFY}"`)
    }
  )

  it('leaves no GiveWP shortcode or form', () => {
    const offenders = all.filter(({ html }) => /\[give_form|class="give-form"/.test(html))
    expect(offenders.map(({ page }) => page)).toEqual([])
  })
})

describe('Learning Annex chrome', () => {
  it('has no WordPress login, register or password-reset trigger', () => {
    const offenders = all.filter(({ html }) => /mk-header-login|mk-login-register/.test(html))
    expect(offenders.map(({ page }) => page)).toEqual([])
  })

  it('has no Popup Maker dialog that nothing opens', () => {
    const offenders = all.filter(({ html }) => /id="pum-\d+"/.test(html))
    expect(offenders.map(({ page }) => page)).toEqual([])
  })

  it('points Enroll at the Learning Annex contact page', () => {
    const offenders = all.filter(({ html }) => html.includes('?page_id=5754'))
    expect(offenders.map(({ page }) => page)).toEqual([])
    const school = read('school')
    expect(school).toMatch(/href="%%BASE%%\/school\/contact-us\/"[^>]*>(?:<[^>]+>)*Enroll/)
  })
})
