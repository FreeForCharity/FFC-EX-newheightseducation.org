/**
 * Central site configuration for this site.
 *
 * EDIT THIS FILE to customize a new FFC-supported nonprofit site.
 * Most values that vary between sites flow from here so individual
 * pages, metadata, sitemap, robots, and security headers stay in sync.
 *
 * After editing, run `npm run check:drift` to verify nothing here drifts
 * away from FFC best practices (placeholder URLs left in, etc.).
 */

export type SiteSocialLink = {
  /** Display label, also used for aria-label. */
  label: string
  /** Absolute https URL. Empty string disables the link. */
  href: string
}

export type SiteAddress = {
  /** Heading shown above the address (e.g. "Main Address"). */
  label: string
  /** Address text, one entry per visual line. */
  lines: readonly string[]
  /** Google Maps (or other) link opened when the address is clicked. */
  mapUrl: string
}

export type SiteConfig = {
  /** Display name of the charity (used in titles, OG/Twitter cards). */
  name: string
  /** Short tagline used in the default title template. */
  tagline: string
  /** Plain-language description used for the <meta description> tag. */
  description: string
  /**
   * Shorter description tuned for OG/Twitter social card previews.
   * Falls back to `description` if empty. Aim for <= 200 chars and avoid
   * em-dashes — some card renderers break on them.
   */
  shortDescription: string
  /**
   * Canonical production URL with no trailing slash.
   * Used by metadataBase, sitemap, and robots. The drift check verifies that
   * this is updated whenever public/CNAME points to a custom domain, and
   * that public/.well-known/security.txt no longer carries the placeholder.
   */
  url: string
  /**
   * Twitter / X handle including the leading @ — e.g. `@freeforcharity`.
   * Empty string omits the twitter:site meta entirely. Handles without `@`
   * are auto-prefixed so a typo doesn't silently break attribution.
   */
  twitterHandle: string
  /**
   * Primary contact email. Used by your own pages; security.txt carries
   * its own `Contact:` line and is not auto-derived from this value.
   * Keep them in sync manually when you change either.
   */
  contactEmail: string
  /** SEO keywords used in the root layout metadata. */
  keywords: readonly string[]
  /** Default theme color (used by manifest and meta tag). */
  themeColor: string
  /** Where the vulnerability disclosure policy lives on this site. */
  vulnerabilityDisclosurePath: string
  /** Social links displayed in the footer. */
  social: readonly SiteSocialLink[]
  /** IRS Employer Identification Number (tax ID), e.g. '00-0000000'. */
  ein: string
  /**
   * Year (or ISO date) the organization was founded, e.g. '2014'.
   * Emitted as schema.org `foundingDate`. Omit to skip it.
   */
  foundingDate?: string
  /**
   * schema.org nonprofit status URL, e.g. 'https://schema.org/Nonprofit501c3'.
   * FFC-supported sites are 501(c)(3) organizations; omit to skip it.
   */
  nonprofitStatus?: string
  /**
   * Other names the organization is known by (brands, abbreviations).
   * Emitted as schema.org `alternateName`. Omit to skip it.
   */
  alternateNames?: readonly string[]
  /**
   * Primary phone number. `display` is the human-readable form shown to users;
   * `tel` is the value used in the `tel:` link (digits, optionally E.164).
   */
  phone: { display: string; tel: string }
  /** Physical office addresses shown in the footer contact column. */
  addresses: readonly SiteAddress[]
  /** GuideStar / Candid transparency profile links shown in the footer. */
  guidestar: { profileUrl: string; directProfileUrl: string }
  /**
   * Permanent attribution to the supporting organization (FFC). Drives the
   * always-rendered "Supported by" clause in the footer bottom bar and the
   * "Supported Charity Login" quick link (`hubUrl`). This is part of the FFC
   * footer standard for every supported charity site: it is REQUIRED, always
   * rendered, and NOT to be removed or repointed when customizing a fork.
   * Distinct from `parentOrg` below, which covers genuine fiscal-sponsorship
   * ("a project of") relationships.
   */
  supportedBy: { name: string; url: string; hubUrl: string }
  /**
   * Parent / umbrella organization, when this site is "a project of" another
   * nonprofit. Omit for a standalone charity (the footer clause is hidden).
   */
  parentOrg?: { name: string; url: string; hubUrl: string }
  /**
   * Label appended after the org name in the footer copyright line to describe
   * tax status, e.g. 'a US 501c3 Non Profit' or 'a pre-501(c)(3) nonprofit'.
   * Empty string renders just the org name with no trailing status clause.
   */
  taxStatusLabel: string
  /**
   * Visibility flags for home-page sections whose default content is
   * FFC-specific marketing rather than per-charity data. A rebranded fork sets
   * these false so the section self-hides instead of showing FFC placeholders.
   * Data-driven sections (Team, Testimonials, Results) self-hide on their own
   * when their data files are emptied and need no flag here.
   */
  sections: {
    /** FFC Endowment feature cards. */
    showEndowment: boolean
    /** FFC's own three-program (Domains/Hosting/Consulting) marketing block. */
    showPrograms: boolean
    /**
     * Unified events section (Google Calendar / Microsoft 365 / Facebook).
     * Also self-hides when no event sources are configured and the committed
     * snapshot (src/data/events.generated.json) is empty — see
     * src/lib/events/visibility.ts.
     */
    showEvents: boolean
  }
  /**
   * Third-party integration endpoints. Each fork points these at its own
   * accounts — the domains are already allow-listed in the CSP, so only the
   * path/ID changes here.
   */
  integrations: {
    /** Zeffy donation-form embed URL (the iframe `src`). */
    zeffyDonationUrl: string
    /** Idealist volunteer-opportunities profile URL. */
    idealistUrl: string
    /**
     * Public Facebook page URL used by the Events section ("View all events
     * on Facebook" link and the empty-state follow button). This is public
     * identity, not a secret — the calendar-source endpoints/tokens stay in
     * EVENTS_* environment variables (see EVENTS_SETUP.md). Empty string
     * hides those links.
     */
    eventsFacebookPageUrl: string
    /** Microsoft Forms application-form URL (https://forms.office.com/r/<id>). */
    microsoftFormUrl: string
  }
}

export const siteConfig: SiteConfig = {
  name: 'New Heights Educational Group',
  tagline: 'Educational Resources to Help Reach Your Goals',
  description:
    'New Heights Educational Group, Inc., promotes literacy for children and adults by offering a range of educational support services. Such services include the following: assisting families in the selection of schools; organization of educational activities; and acquisition of materials.',
  shortDescription:
    'Promoting literacy for children and adults through educational support services for home, charter and public school families.',
  // Bare origin only (drift-check enforced). The template deploys to the
  // GitHub Pages default URL; the /FFC-IN-FFC_Single_Page_Template subpath
  // comes from NEXT_PUBLIC_BASE_PATH, which siteUrl() folds in at build time.
  // A fork with a custom domain sets its own origin here (and no basePath).
  url: 'https://freeforcharity.github.io',
  twitterHandle: '@newheightseduc1',
  contactEmail: 'info@newheightseducation.org',
  keywords: [
    'nonprofit',
    'education',
    'literacy',
    'tutoring',
    'homeschool',
    'charter school',
    'Ohio',
    'volunteer',
    'donate',
  ],
  themeColor: '#ffffff',
  vulnerabilityDisclosurePath: '/vulnerability-disclosure-policy',
  social: [
    { label: 'Facebook', href: 'https://www.facebook.com/NewHeightsEducationalGroup' },
    { label: 'X (Twitter)', href: 'https://x.com/newheightseduc1' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/10828913' },
    { label: 'YouTube', href: 'https://www.youtube.com/channel/UCcpyuCpFRzYzfHYznRlX_zw' },
  ],
  ein: '26-1424214',
  // 2006, confirmed by NHEG (#25). 2014 was Free For Charity's own founding
  // year, inherited from the template; NHEG's contact page says the
  // organization "was formed on June 1, 2006".
  foundingDate: '2006',
  nonprofitStatus: 'https://schema.org/Nonprofit501c3',
  phone: { display: '419.786.0247', tel: '4197860247' },
  addresses: [
    {
      label: 'Main Address',
      lines: ['11809 US Route 127', 'Sherwood, Ohio 43556'],
      mapUrl:
        'https://www.google.com/maps/search/?api=1&query=11809+US+Route+127+Sherwood+OH+43556',
    },
  ],
  guidestar: {
    profileUrl: 'https://www.guidestar.org/profile/26-1424214',
    directProfileUrl:
      'https://www.guidestar.org/profile/shared/5c37b63b-6a75-4ab0-9be9-491908c269d7',
  },
  supportedBy: {
    name: 'Free For Charity',
    url: 'https://freeforcharity.org',
    hubUrl: 'https://freeforcharity.org/hub/',
  },
  taxStatusLabel: 'a US 501c3 Non Profit',
  sections: {
    // Both off: these two sections are Free For Charity's own marketing copy,
    // no route on this site renders them, and they are parked under
    // _disabled_template_routes/. The flags stay because the Header and Footer
    // read them to decide whether to show a "Programs" nav link -- with the
    // flag off the link self-hides rather than pointing at a #programs anchor
    // no page has.
    showEndowment: false,
    showPrograms: false,
    showEvents: true,
  },
  integrations: {
    zeffyDonationUrl:
      'https://www.zeffy.com/embed/donation-form/48e1112a-8e9f-4c73-8b19-0caa89669ff5',
    idealistUrl: 'https://www.idealist.org/en/nonprofit/7bdfa3deb71c4175acda6ddc9ec011e1',
    eventsFacebookPageUrl: 'https://www.facebook.com/NewHeightsEducationalGroup',
    // TODO(unsourced): still Free For Charity's form. NHEG's own captured
    // pages say "This form has moved to email. Info@NewHeightsEducation.org",
    // so there may be no replacement to point at. Needs NHEG.
    microsoftFormUrl: 'https://forms.office.com/r/vePxGq6JqG',
  },
}

/**
 * Compose a fully-qualified URL on this site.
 *
 * The path is required to be a same-origin absolute path (starting with `/`).
 * This rules out protocol-relative inputs like `//evil.com` that could leak
 * into a future redirect or canonical link.
 */
export function siteUrl(path = '/'): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new TypeError(
      `siteUrl: path must be a same-origin absolute path starting with a single "/" (got: ${JSON.stringify(path)})`
    )
  }
  // Fold in the GitHub Pages subpath (empty on custom-domain deploys) so
  // canonical/OG/sitemap URLs stay correct on the default *.github.io URL.
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  const base = siteConfig.url.replace(/\/$/, '') + basePath
  return `${base}${path}`
}

/**
 * Returns the Twitter handle with a guaranteed leading `@`.
 * Returns `undefined` (so the meta tag is omitted) if the handle is empty
 * or is just an `@` with no body — emitting a bare `@` would advertise a
 * malformed handle to Twitter's scraper.
 */
export function twitterSite(): string | undefined {
  const raw = siteConfig.twitterHandle.trim().replace(/^@+/, '')
  if (!raw) return undefined
  return `@${raw}`
}

/**
 * Free For Charity's own EIN, as the template ships it.
 *
 * `ffc-footer` carries an identical constant, inlined there because workflow
 * 706 copies that file into charity repos whose `site.config` may not export
 * this helper yet. This is the copy the rest of `src/` uses, so a component
 * never has to hold the literal.
 */
export const TEMPLATE_EIN = '46-2471893'

/**
 * The charity's EIN, or empty when the config still carries the template's.
 *
 * `ein` is a required field, so an unedited or half-edited fork has a value
 * either way — and a tax ID is the one field where being confidently wrong is
 * worse than being absent. It is what a donor claims a deduction against and
 * what a knowledge panel repeats.
 *
 * `check:drift` does flag a template EIN left in this file — measured, it
 * reports `src/lib/site.config.ts:NNN still references Free For Charity's EIN`
 * once `siteConfig.name` differs — so this is not the only guard, and the gate
 * is not as blind as it first looks. It is the guard that still holds in the
 * window the gate cannot see: a rebrand in progress, a branch CI has not run
 * yet, a fork that edits the name and the EIN in separate commits. Emitting
 * nothing is always safe; `OrganizationSchema` simply omits `taxID`.
 *
 * Same shape as `assertedParentOrg` below, and for the same reason: a shipped
 * default that is wrong for every site inheriting it, and wrong in the
 * direction that misstates the charity.
 */
export function assertedEin(): string {
  const ein = siteConfig.ein?.trim() ?? ''
  return ein === TEMPLATE_EIN ? '' : ein
}

/**
 * The parent organization to ASSERT, or null.
 *
 * `parentOrg` and `supportedBy` mean different things and the difference is a
 * statement about the charity's legal standing. `supportedBy` is the FFC
 * program attribution, required on every supported site. `parentOrg` is
 * genuine fiscal sponsorship -- "a project of" -- which says the charity is
 * not independent.
 *
 * An FFC-EX repo is an EXTERNAL charity's own site: Free For Charity provides
 * the website and domain at no cost, and the charity is its own 501(c)(3).
 * The template nonetheless ships `parentOrg` pointing at Free For Charity,
 * the same organization as `supportedBy`, so a fork that changes nothing
 * renders "Supported by Free For Charity | A project of Free For Charity" in
 * its footer -- measured on this site's `main`, on all 793 pages.
 *
 * That pair is self-contradictory by FFC's own definitions, and the
 * authoritative footer standard
 * (FFC-IN-ffcadmin.org/docs/footer-standard-adoption-checklist.md) lists
 * "Supported by Free For Charity" as required and has no parent-organization
 * item at all. So a `parentOrg` naming the supporting organization is the
 * template's default leaking through, never a real relationship, and it is
 * refused here rather than in each of the three places that render it.
 *
 * Same class as `ffc-footer`'s TEMPLATE_EIN guard: a shipped default that is
 * wrong for every site inheriting it, and wrong in the direction that
 * misstates the charity.
 *
 * Compared on name OR url, because a fork that retitles the block without
 * repointing it -- or repoints without retitling -- is still the template
 * default wearing a different label.
 */
export function assertedParentOrg(): SiteConfig['parentOrg'] | null {
  const parent = siteConfig.parentOrg
  if (!parent) return null
  const norm = (s: string) => s.trim().toLowerCase().replace(/\/+$/, '')
  const same =
    norm(parent.name) === norm(siteConfig.supportedBy.name) ||
    norm(parent.url) === norm(siteConfig.supportedBy.url)
  return same ? null : parent
}

/** Returns the OG/Twitter card description, falling back to the longer page description. */
export function cardDescription(): string {
  return siteConfig.shortDescription.trim() || siteConfig.description
}
