import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import manifest from '@/app/manifest'
import { siteConfig } from '@/lib/site.config'

// Ported from FFC-EX-theeverythingproject.org.
describe('manifest and Lighthouse parity', () => {
  const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH

  afterEach(() => {
    if (originalBasePath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH
    else process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath
  })

  it('generates the app manifest from siteConfig', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH
    expect(manifest()).toEqual(
      expect.objectContaining({
        name: siteConfig.name,
        short_name: siteConfig.name,
        description: siteConfig.shortDescription || siteConfig.description,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: siteConfig.themeColor,
        theme_color: siteConfig.themeColor,
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      })
    )
  })

  it('prefixes manifest paths with NEXT_PUBLIC_BASE_PATH for GitHub Pages deploys', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/FFC-EX-newheightseducation.org'
    const generated = manifest()
    expect(generated.start_url).toBe('/FFC-EX-newheightseducation.org/')
    expect(generated.scope).toBe('/FFC-EX-newheightseducation.org/')
    expect(generated.icons?.map((icon) => icon.src)).toEqual([
      '/FFC-EX-newheightseducation.org/android-chrome-192x192.png',
      '/FFC-EX-newheightseducation.org/android-chrome-512x512.png',
    ])
  })

  it('Lighthouse workflow derives basePath instead of hard-coding this repository', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/lighthouse.yml'), 'utf8')
    expect(workflow).toContain('id: basepath')
    expect(workflow).toContain('public/CNAME')
    expect(workflow).toContain('value=/${GITHUB_REPOSITORY#*/}')
    expect(workflow).toContain('NEXT_PUBLIC_BASE_PATH: ${{ steps.basepath.outputs.value }}')
    expect(workflow).toContain('rm -rf .lighthouseci-dist')
    expect(workflow).toContain('.ci.collect.staticDistDir = "./.lighthouseci-dist"')
    expect(workflow).toContain('jq --arg base_path')
    expect(workflow).not.toContain('NEXT_PUBLIC_BASE_PATH: /FFC-EX-newheightseducation.org')
  })

  it('Lighthouse audits one page of every template', () => {
    const rc = JSON.parse(readFileSync(join(process.cwd(), 'lighthouserc.json'), 'utf8'))
    expect(rc.ci.collect.url).toEqual([
      'http://localhost/index.html',
      'http://localhost/contact-us/index.html',
      'http://localhost/shop/index.html',
      'http://localhost/cookie-policy/index.html',
      'http://localhost/privacy-policy/index.html',
      'http://localhost/terms-of-service/index.html',
      'http://localhost/nheg-news/new-heights-educational-group-volunteer-stats/index.html',
      'http://localhost/category/nheg-news/index.html',
      'http://localhost/category/nheg-news/page/2/index.html',
      'http://localhost/author/pamela-clark/index.html',
      'http://localhost/tag/national-school-choice-week/index.html',
      'http://localhost/product/aag-duffel-bag/index.html',
      'http://localhost/volunteer-with-nheg/volunteer-form/index.html',
      'http://localhost/publications/index.html',
      'http://localhost/publications/nheg-edguide-september-october-2020/index.html',
      'http://localhost/publications/books/nheg-edguide-march-2016/index.html',
      'http://localhost/school/index.html',
      'http://localhost/school/students/nheg-yearbook/index.html',
      'http://localhost/radio/index.html',
      'http://localhost/radio/manya-shukla/index.html',
      'http://localhost/search/index.html',
    ])
  })
})
