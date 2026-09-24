import {
  googleCalendarUrl,
  icsDataUri,
  office365Url,
  outlookLiveUrl,
} from '@/lib/events/addToCalendar'
import { siteConfig } from '@/lib/site.config'
import type { UnifiedEvent } from '@/lib/events/types'

const event: UnifiedEvent = {
  id: 'google:test',
  source: 'google',
  title: 'Test Event, with comma',
  description: 'Some description; with semicolons',
  startUtc: '2099-06-15T14:30:00.000Z',
  endUtc: '2099-06-15T16:00:00.000Z',
  allDay: false,
  location: '123 Main St, Anywhere',
  url: 'https://example.org/event',
}

describe('addToCalendar URL helpers', () => {
  it('googleCalendarUrl includes compact UTC range and url-encoded fields', () => {
    const url = new URL(googleCalendarUrl(event))
    expect(url.hostname).toBe('calendar.google.com')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('text')).toBe(event.title)
    expect(url.searchParams.get('dates')).toBe('20990615T143000Z/20990615T160000Z')
    expect(url.searchParams.get('location')).toBe(event.location)
  })

  it('office365Url and outlookLiveUrl include ISO datetimes', () => {
    const o365 = new URL(office365Url(event))
    expect(o365.hostname).toBe('outlook.office.com')
    expect(o365.searchParams.get('startdt')).toBe(event.startUtc)
    expect(o365.searchParams.get('enddt')).toBe(event.endUtc)

    const live = new URL(outlookLiveUrl(event))
    expect(live.hostname).toBe('outlook.live.com')
    expect(live.searchParams.get('subject')).toBe(event.title)
  })

  it('icsDataUri produces a valid data: URI with VEVENT', () => {
    const uri = icsDataUri(event)
    expect(uri).toMatch(/^data:text\/calendar;charset=utf-8,/)
    const decoded = decodeURIComponent(uri.replace(/^data:[^,]+,/, ''))
    expect(decoded).toContain('BEGIN:VCALENDAR')
    expect(decoded).toContain('BEGIN:VEVENT')
    expect(decoded).toContain('UID:google:test')
    expect(decoded).toContain('DTSTART:20990615T143000Z')
    expect(decoded).toContain('DTEND:20990615T160000Z')
    expect(decoded).toContain('SUMMARY:Test Event\\, with comma')
    expect(decoded).toContain('DESCRIPTION:Some description\\; with semicolons')
    expect(decoded).toContain('END:VEVENT')
  })

  it('escapes the organisation name in PRODID', () => {
    // PRODID is an iCalendar TEXT value, so an unescaped comma or semicolon
    // in the organisation's name ends the property early and the .ics no
    // longer parses. This site's name happens to contain neither, which is
    // why the guard has to supply one rather than read the real config.
    const original = siteConfig.name
    try {
      siteConfig.name = 'Acme, Inc.; Education'
      const decoded = decodeURIComponent(icsDataUri(event).replace(/^data:[^,]+,/, ''))
      expect(decoded).toContain('PRODID:-//Acme\\, Inc.\\; Education//Events//EN')
    } finally {
      siteConfig.name = original
    }
  })

  it('falls back to a 1-hour default when no end time is given', () => {
    const startOnly: UnifiedEvent = { ...event, endUtc: undefined }
    const uri = icsDataUri(startOnly)
    const decoded = decodeURIComponent(uri.replace(/^data:[^,]+,/, ''))
    expect(decoded).toContain('DTSTART:20990615T143000Z')
    expect(decoded).toContain('DTEND:20990615T153000Z')
  })
})
