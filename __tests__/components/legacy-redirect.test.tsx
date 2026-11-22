import React from 'react'
import { render } from '@testing-library/react'
import LegacyRedirect, {
  legacyRedirectMetadata,
  legacyTarget,
} from '../../src/components/legacy-redirect'

describe('LegacyRedirect', () => {
  it('renders a zero-delay meta refresh and a matching visible link', () => {
    const { container, getByRole } = render(
      <LegacyRedirect to="/school/students/" label="Students" />
    )
    const meta = container.ownerDocument.querySelector('meta[http-equiv="refresh"]')
    expect(meta?.getAttribute('content')).toBe('0;url=/school/students/')
    expect(getByRole('link', { name: 'Students' }).getAttribute('href')).toBe('/school/students/')
  })

  it('leaves absolute URLs untouched', () => {
    expect(legacyTarget('https://www.zeffy.com/donation-form/x')).toBe(
      'https://www.zeffy.com/donation-form/x'
    )
  })

  it('keeps redirect stubs out of search indexes', () => {
    expect(legacyRedirectMetadata('X').robots).toEqual({ index: false })
  })
})
