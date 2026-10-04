#!/usr/bin/env node
/**
 * One-off (#55): replaces the "form has moved to email" block that stood in
 * for each payment or GiveWP form, per the #42 rulings. PayPal hosted buttons
 * that still work are restored with the live site's button IDs; expired 2017
 * offers get a closing note; buttons broken on the live site point to the
 * contact page; GiveWP points to Zeffy.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const CONTENT = join(import.meta.dirname, '..', 'src', 'clone-content')
const FALLBACK = /<div class="ffc-contact-fallback"[^>]*>.*?<\/div>/gs
export const ZEFFY = 'https://www.zeffy.com/donation-form/48e1112a-8e9f-4c73-8b19-0caa89669ff5'

const paypal = (buttonId, label, options) => {
  const select = options
    ? `<label class="ffc-paypal__option">${label} <select name="os0">${options
        .map(([value, text]) => `<option value="${value}">${text}</option>`)
        .join('')}</select></label>`
    : ''
  return (
    '<form class="ffc-paypal" action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_top">' +
    `<input type="hidden" name="cmd" value="_s-xclick" /><input type="hidden" name="hosted_button_id" value="${buttonId}" />` +
    (options ? `<input type="hidden" name="on0" value="${label}" />` : '') +
    select +
    '<input type="hidden" name="currency_code" value="USD" />' +
    '<button type="submit" class="ffc-paypal__button">Buy now with PayPal</button></form>'
  )
}
const note = (text) => `<p class="ffc-payment-note"><em>${text}</em></p>`
const contact = (text) =>
  `<p class="ffc-payment-note">${text} <a href="%%BASE%%/contact-us/">Contact us</a> to arrange payment.</p>`
const zeffy = (text) =>
  `<p class="ffc-payment-note">${text}</p><p><a class="mk-button ffc-zeffy-button" href="${ZEFFY}" target="_blank" rel="noopener noreferrer">Donate through Zeffy</a></p>`

/** page -> [index of the fallback block on that page, replacement] */
export const REPLACEMENTS = {
  'who-we-are/nheg-edguide': [
    1,
    paypal('U8YWFU9M4TQVY', 'Magazine Ad', [
      ['1/2 page/2 issues', '1/2 page/2 issues $20.00 USD'],
      ['Full page/2 issues', 'Full page/2 issues $30.00 USD'],
      ['1/2 page/4 issues', '1/2 page/4 issues $36.00 USD'],
      ['Full page/4 issues', 'Full page/4 issues $54.00 USD'],
      ['1/2 page/6 issues', '1/2 page/6 issues $48.00 USD'],
      ['Full page/6 issues', 'Full page/6 issues $72.00 USD'],
    ]),
  ],
  'school/students/school-senior-pictures': [
    0,
    paypal('RH2HKX6TVNNKA', 'Payment', [
      ['Deposit', 'Deposit $50.00 USD'],
      ['Remainder', 'Remainder $100.00 USD'],
    ]),
  ],
  'nheg-news/disney-park-hopper-tickets-raffle': [
    0,
    note('This raffle ended on October 31, 2017.'),
  ],
  'nheg-news/nheg-writing-contest': [
    0,
    note('Entries for this contest closed on September 30, 2017.'),
  ],
  'nheg-educational-programs/nheg-tutoring-program': [0, contact('Tutoring is a paid service.')],
  'school/students/nheg-yearbook': [1, contact('To order a yearbook,')],
  'school/donation-history': [
    0,
    zeffy('Donations to NHEG are now made and receipted through Zeffy.'),
  ],
}

const GIVE_SHORTCODE = /<p>\[give_form id=[^\]]*\]<\/p>/g

export function apply(page, html) {
  let out = html
  const r = REPLACEMENTS[page]
  if (r) {
    const [index, replacement] = r
    let seen = -1
    out = out.replace(FALLBACK, (block) => (++seen === index ? replacement : block))
    if (seen < index) throw new Error(`${page}: no fallback block #${index}`)
  }
  return out
    .replace(GIVE_SHORTCODE, zeffy('Support NHEG on #GivingTuesday or any day.'))
    .replace(/<div class="give-form">/g, '<div class="ffc-giving">')
}

if (process.argv[1] === import.meta.filename) {
  for (const page of [
    ...Object.keys(REPLACEMENTS),
    'support-nheg/giving-tuesday-november-27-2018',
  ]) {
    const file = join(CONTENT, `${page}.html`)
    const html = readFileSync(file, 'utf8')
    const next = apply(page, html)
    if (next === html) throw new Error(`${page}: nothing replaced`)
    writeFileSync(file, next)
    console.log(`patched ${page}`)
  }
}
