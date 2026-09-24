import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertedParentOrg,
  siteConfig,
  siteUrl,
  twitterSite,
  cardDescription,
} from '../../src/lib/site.config'

describe('supportedBy (FFC footer standard)', () => {
  // The permanent "Supported by" attribution is required on every FFC-supported
  // charity site. These assertions guard against a fork (or refactor) removing
  // or repointing it — the values are intentionally FFC's, forever.
  it('is present and points at Free For Charity', () => {
    expect(siteConfig.supportedBy).toEqual({
      name: 'Free For Charity',
      url: 'https://freeforcharity.org',
      hubUrl: 'https://freeforcharity.org/hub/',
    })
  })
})

describe('assertedParentOrg', () => {
  // `supportedBy` and `parentOrg` are different claims: the first is the FFC
  // program attribution required on every supported site, the second says the
  // charity is not independent. The template ships `parentOrg` pointing at
  // Free For Charity, so an unedited fork published "Supported by Free For
  // Charity | A project of Free For Charity" -- self-contradictory, and wrong
  // in the direction that misstates the charity's legal standing.
  const original = siteConfig.parentOrg
  afterEach(() => {
    siteConfig.parentOrg = original
  })

  it('refuses a parent that is the supporting organization, by name', () => {
    siteConfig.parentOrg = {
      name: siteConfig.supportedBy.name,
      url: 'https://somewhere-else.example',
      hubUrl: 'https://somewhere-else.example/hub/',
    }
    expect(assertedParentOrg()).toBeNull()
  })

  it('refuses it by URL too, so a renamed copy cannot slip through', () => {
    siteConfig.parentOrg = {
      name: 'Some Other Name',
      url: siteConfig.supportedBy.url,
      hubUrl: 'https://x.example/hub/',
    }
    expect(assertedParentOrg()).toBeNull()
  })

  // The normalization earns its place here: a fork is far likelier to write
  // the supporting org with a trailing slash or different casing than to
  // reproduce it byte for byte, and an exact comparison would wave those
  // through as a real parent. Mutation review found this untested.
  it('refuses it through casing, padding and a trailing slash', () => {
    siteConfig.parentOrg = {
      name: `  ${siteConfig.supportedBy.name.toUpperCase()}  `,
      url: 'https://unrelated.example',
      hubUrl: 'https://unrelated.example/hub/',
    }
    expect(assertedParentOrg()).toBeNull()

    siteConfig.parentOrg = {
      name: 'Some Other Name',
      url: `${siteConfig.supportedBy.url.replace(/\/+$/, '')}/`,
      hubUrl: 'https://x.example/hub/',
    }
    expect(assertedParentOrg()).toBeNull()
  })

  it('still asserts a GENUINE umbrella organization', () => {
    const real = {
      name: 'Ohio Literacy Umbrella',
      url: 'https://umbrella.example',
      hubUrl: 'https://umbrella.example/hub/',
    }
    siteConfig.parentOrg = real
    expect(assertedParentOrg()).toEqual(real)
  })

  it('is null when no parent is configured at all', () => {
    siteConfig.parentOrg = undefined
    expect(assertedParentOrg()).toBeNull()
  })

  it('this site is external: it asserts no parent organization', () => {
    expect(assertedParentOrg()).toBeNull()
  })
})

describe('the parent-org rule has one meaning, in two files', () => {
  // `src/components/ffc-footer/` is GENERATED: workflow 706 copies it from
  // FFC-Cloudflare-Automation/assets/ffc-footer.tsx into charity repos whose
  // site.config may not export the shared helper, so it carries its own copy
  // of the rule. Two copies of a safety rule is exactly how one of them ends
  // up wrong, so this asserts they are the same code rather than trusting a
  // comment that says they are.
  const normalize = (src: string) => {
    const m = /function assertedParentOrg\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(src)
    // Thrown rather than expect()ed: jest's expect takes no message argument,
    // and a rename must fail loudly rather than compare two empty strings —
    // which would pass.
    if (!m) throw new Error('assertedParentOrg not found — did it get renamed?')
    return m[1].replace(/\s+/g, ' ').trim()
  }
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

  it('ffc-footer inlines exactly the rule site.config exports', () => {
    expect(normalize(read('src/components/ffc-footer/index.tsx'))).toBe(
      normalize(read('src/lib/site.config.ts'))
    )
  })
})

describe('integrations.zeffyDonationUrl', () => {
  // The field is consumed as an iframe `src` (SupportFreeForCharity), and
  // Zeffy serves a frameable form only from its /embed/ endpoint. The hosted
  // /donation-form/ URL is the right one for an <a> and the wrong one here,
  // and the two differ by four characters -- so a fork pasting the link it
  // has to hand produces a donation panel that silently refuses to render.
  it('is an embeddable Zeffy form, not the hosted page', () => {
    const url = new URL(siteConfig.integrations.zeffyDonationUrl)
    expect(url.hostname).toBe('www.zeffy.com')
    expect(url.pathname.startsWith('/embed/donation-form/')).toBe(true)
  })
})

describe('siteUrl', () => {
  it('returns the base URL for "/"', () => {
    expect(siteUrl('/')).toBe(`${siteConfig.url}/`)
  })

  it('preserves single absolute paths', () => {
    expect(siteUrl('/foo')).toBe(`${siteConfig.url}/foo`)
    expect(siteUrl('/foo/bar/')).toBe(`${siteConfig.url}/foo/bar/`)
  })

  it('throws on an empty string', () => {
    expect(() => siteUrl('')).toThrow(TypeError)
  })

  it('throws on a relative path with no leading slash', () => {
    expect(() => siteUrl('foo')).toThrow(TypeError)
  })

  it('throws on a protocol-relative path (closes redirect-bypass surface)', () => {
    expect(() => siteUrl('//evil.com/x')).toThrow(TypeError)
  })

  it('throws on non-string input', () => {
    // @ts-expect-error -- intentionally passing wrong type to exercise the guard
    expect(() => siteUrl(123)).toThrow(TypeError)
    // @ts-expect-error -- intentionally passing wrong type to exercise the guard
    expect(() => siteUrl(null)).toThrow(TypeError)
  })

  it('uses the default "/" path when called with no argument', () => {
    expect(siteUrl()).toBe(`${siteConfig.url}/`)
  })

  it('strips a trailing slash from siteConfig.url before joining', () => {
    // Mutate siteConfig.url to actually exercise the trailing-slash
    // branch in siteUrl(). Without this the previous assertion was
    // testing the no-slash default path and giving false confidence.
    const original = siteConfig.url
    try {
      siteConfig.url = original.replace(/\/?$/, '/') // ensure trailing slash
      expect(siteUrl('/x')).toBe(original.replace(/\/$/, '') + '/x')
      expect(siteUrl('/x').includes('//x')).toBe(false)
    } finally {
      siteConfig.url = original
    }
  })
})

describe('twitterSite', () => {
  // The default fixture sets twitterHandle = '@freeforcharity'. These tests
  // mutate the module-level config object temporarily so the helper sees
  // the input we want to exercise.
  const original = siteConfig.twitterHandle
  afterEach(() => {
    siteConfig.twitterHandle = original
  })

  it('passes through a well-formed @handle unchanged', () => {
    siteConfig.twitterHandle = '@foo'
    expect(twitterSite()).toBe('@foo')
  })

  it('prepends @ when missing so attribution does not silently break', () => {
    siteConfig.twitterHandle = 'foo'
    expect(twitterSite()).toBe('@foo')
  })

  it('returns undefined when handle is empty / whitespace / bare @', () => {
    for (const raw of ['', '   ', '@', '@@', '@ ']) {
      siteConfig.twitterHandle = raw
      expect(twitterSite()).toBeUndefined()
    }
  })

  it('does not duplicate the @ prefix on already-prefixed input', () => {
    siteConfig.twitterHandle = '@@foo'
    expect(twitterSite()).toBe('@foo')
  })
})

describe('cardDescription', () => {
  const original = siteConfig.shortDescription
  afterEach(() => {
    siteConfig.shortDescription = original
  })

  it('returns the shorter card-tuned copy when present', () => {
    siteConfig.shortDescription = 'short'
    expect(cardDescription()).toBe('short')
  })

  it('falls back to description when shortDescription is empty', () => {
    siteConfig.shortDescription = ''
    expect(cardDescription()).toBe(siteConfig.description)
  })

  it('falls back when shortDescription is whitespace only', () => {
    siteConfig.shortDescription = '   '
    expect(cardDescription()).toBe(siteConfig.description)
  })
})
