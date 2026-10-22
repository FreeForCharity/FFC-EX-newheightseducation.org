/**
 * @jest-environment node
 */
import { STRIKE_STYLE, parseTable, repairStruckLinks } from '../../scripts/repair-struck-links.mjs'

const table = parseTable(
  [
    'url,result,new_url,note,home_url',
    'https://old.example/a?x=1&y=2,moved,https://new.example/a?x=1&y=2,',
    'https://old.example/,moved,https://new.example/,text is the url',
    'https://ok.example/,works,,',
    'https://gone.example/,dead,,404',
    'https://site.example/old/page,dead,,404,https://site.example/',
    'https://wall.example/,unverified,,"bot wall, kept"',
  ].join('\n')
)

describe('parseTable', () => {
  it('reads quoted notes and rejects a bad row', () => {
    expect(table.get('https://wall.example/')).toEqual({ result: 'unverified', newUrl: '' })
    expect(() => parseTable('url,result,new_url,note\nhttps://x/,maybe,,')).toThrow('bad result')
    expect(() => parseTable('url,result,new_url,note\nhttps://x/,moved,,')).toThrow('moved')
    expect(() =>
      parseTable('url,result,new_url,note,home_url\nhttps://x/,works,,,https://x/')
    ).toThrow('home url')
  })
})

describe('repairStruckLinks', () => {
  it('repoints a moved link, keeping its other attributes and escaping the query', () => {
    const { html } = repairStruckLinks(
      '<a href="https://old.example/a?x=1&amp;y=2" target="_blank" class="broken_link">A</a>',
      table
    )
    expect(html).toBe('<a href="https://new.example/a?x=1&amp;y=2" target="_blank">A</a>')
  })

  it('updates link text that was the old address', () => {
    const { html } = repairStruckLinks(
      '<a href="https://old.example/" class="broken_link">https://old.example/</a>',
      table
    )
    expect(html).toBe('<a href="https://new.example/">https://new.example/</a>')
  })

  it('unlinks a dead link and keeps its text and markup', () => {
    const { html, counts } = repairStruckLinks(
      '<p>See <a href="https://gone.example/" rel="noopener" class="broken_link"><strong>Gone</strong></a>.</p>',
      table
    )
    expect(html).toBe('<p>See <strong>Gone</strong>.</p>')
    expect(counts.dead).toBe(1)
  })

  it('points a dead link whose site still loads at its home page', () => {
    const { html, counts } = repairStruckLinks(
      '<a href="https://site.example/old/page" target="_blank" class="broken_link">Site</a>',
      table
    )
    expect(html).toBe('<a href="https://site.example/" target="_blank">Site</a>')
    expect(counts.dead).toBe(1)
  })

  it('only drops the strike from working and unverified links', () => {
    const { html } = repairStruckLinks(
      `${STRIKE_STYLE}<a href="https://ok.example/" class="broken_link">Ok</a><a href="https://wall.example/" class="broken_link">W</a>`,
      table
    )
    expect(html).toBe('<a href="https://ok.example/">Ok</a><a href="https://wall.example/">W</a>')
  })

  it('refuses a struck link it has no result for, and is a no-op on a repaired page', () => {
    expect(() =>
      repairStruckLinks('<a href="https://new.example/x" class="broken_link">X</a>', table)
    ).toThrow('no result')
    const once = repairStruckLinks(
      '<a href="https://gone.example/" class="broken_link">G</a>',
      table
    )
    expect(repairStruckLinks(once.html, table).html).toBe(once.html)
  })
})
