import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { siteConfig } from '@/lib/site.config'

// Ported from FFC-EX-theeverythingproject.org.
const root = process.cwd()
// Matches deploy.yml: with public/CNAME the site serves at the domain root.
const PROJECT_PATH = existsSync(join(root, 'public/CNAME')) ? '' : '/FFC-EX-newheightseducation.org'
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const payload = (body: string) =>
  body
    .split('\n')
    .filter((line) => !line.startsWith('#') && line.trim() !== '')
    .join('\n')
    .trim()

describe('deployable security artifacts', () => {
  // public/_headers is inert on GitHub Pages; this locks the copy kept for a
  // possible Cloudflare Pages deploy. It is not evidence any header reaches a
  // browser today.
  it('keeps the _headers copy intact, with a CSP that allows the embeds live shows', () => {
    const headers = read('public/_headers')
    expect(headers).toContain('X-Frame-Options: SAMEORIGIN')
    expect(headers).toContain('X-Content-Type-Options: nosniff')
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin')
    expect(headers).toContain('Strict-Transport-Security: max-age=63072000; includeSubDomains')
    expect(headers).toContain("Content-Security-Policy: default-src 'self'")
    for (const host of [
      'https://www.googletagmanager.com',
      'https://www.google-analytics.com',
      'https://connect.facebook.net',
      'https://www.clarity.ms',
      'https://widget.spreaker.com',
      'https://rumble.com',
      'https://www.canva.com',
      'https://www.youtube.com',
    ]) {
      expect(headers).toContain(host)
    }
  })

  it('publishes matching RFC 9116 security.txt payloads at root and well-known paths', () => {
    expect(existsSync(join(root, 'public/.well-known/security.txt'))).toBe(true)
    expect(existsSync(join(root, 'public/security.txt'))).toBe(true)
    const wellKnown = payload(read('public/.well-known/security.txt'))
    expect(payload(read('public/security.txt'))).toBe(wellKnown)
    expect(wellKnown).toContain(`Contact: mailto:${siteConfig.contactEmail}`)
    expect(wellKnown).toContain('Preferred-Languages: en')
    const base = `${siteConfig.url}${PROJECT_PATH}`
    expect(wellKnown).toContain(`Canonical: ${base}/.well-known/security.txt`)
    expect(wellKnown).toContain(`Canonical: ${base}/security.txt`)
    expect(wellKnown).toContain(`Policy: ${base}${siteConfig.vulnerabilityDisclosurePath}`)
    expect(wellKnown).toContain(`Acknowledgments: ${base}/security-acknowledgements`)
    const expires = wellKnown.match(/^Expires:\s*(.+)$/m)?.[1]
    expect(expires).toBeDefined()
    expect(new Date(expires as string).getTime()).toBeGreaterThan(Date.now())
  })

  it('defines a least-privilege expiry workflow for security.txt maintenance', () => {
    const workflow = read('.github/workflows/security-txt-expiry.yml')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain("cron: '0 12 * * 1'")
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('issues: write')
    for (const marker of ['missing', 'no-expires', 'invalid-expires', 'expiring-soon']) {
      expect(workflow).toContain(`ffc-security-txt:${marker}`)
    }
    expect(workflow).toContain('github.rest.issues.listForRepo')
    expect(workflow).toContain('github.rest.issues.create')
    expect(workflow).not.toContain('secrets.')
  })
})
