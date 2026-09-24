import React from 'react'
import { render } from '@testing-library/react'
import { siteConfig } from '@/lib/site.config'
import Events from '../../src/components/home-page/Events'

// Self-hiding behavior (FFC-Cloudflare-Automation#816 Part B): a home-page
// section gated behind siteConfig.sections.* renders null rather than an empty
// shell, so a rebranded fork hides it without leaving a heading or a dead
// #anchor behind. Exercised by mutating the shared config object (the
// established pattern in site.config.test.ts) and restoring it afterward.
//
// This file was `home-page/section-visibility.test.tsx` and also covered
// Endowment-Features and Our-Programs. Those two sections carry Free For
// Charity's own marketing copy, no route renders them on this site, and they
// are parked under _disabled_template_code/ along with their tests. Events
// is the one gated section still reachable, so the file moved up a level and
// was renamed for what it now covers.
describe('Events section visibility', () => {
  const original = {
    showEvents: siteConfig.sections.showEvents,
    sourcesConfigured: process.env.EVENTS_SOURCES_CONFIGURED,
  }
  afterEach(() => {
    siteConfig.sections.showEvents = original.showEvents
    if (original.sourcesConfigured === undefined) {
      delete process.env.EVENTS_SOURCES_CONFIGURED
    } else {
      process.env.EVENTS_SOURCES_CONFIGURED = original.sourcesConfigured
    }
  })

  it('Events renders nothing when showEvents is false', () => {
    siteConfig.sections.showEvents = false
    // Even with a configured source the flag alone must hide the section.
    process.env.EVENTS_SOURCES_CONFIGURED = 'true'
    const { container } = render(<Events />)
    expect(container).toBeEmptyDOMElement()
  })

  it('Events renders nothing when no sources are configured and the snapshot is empty', () => {
    // The state this site ships in: flag on, no EVENTS_* sources wired up, and the
    // committed src/data/events.generated.json snapshot is empty.
    siteConfig.sections.showEvents = true
    delete process.env.EVENTS_SOURCES_CONFIGURED
    const { container } = render(<Events />)
    expect(container).toBeEmptyDOMElement()
  })

  it('Events renders (empty state) when a source is configured but has no events yet', () => {
    siteConfig.sections.showEvents = true
    process.env.EVENTS_SOURCES_CONFIGURED = 'true'
    const { container } = render(<Events />)
    expect(container).not.toBeEmptyDOMElement()
    expect(container.querySelector('[data-testid="events-empty-state"]')).not.toBeNull()
  })
})
