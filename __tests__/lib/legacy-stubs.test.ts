/**
 * @jest-environment node
 */
import fs from 'fs'
import path from 'path'
import { STUBS, relativeTarget, stubHtml } from '../../scripts/write-legacy-stubs.mjs'

const ROOT = process.cwd()
const isRoute = (route: string) => {
  const rel = route.replace(/^\/|\/$/g, '')
  return (
    rel === '' ||
    fs.existsSync(path.join(ROOT, 'src', 'clone-content', `${rel}.html`)) ||
    fs.existsSync(path.join(ROOT, 'src', 'app', rel, 'page.tsx'))
  )
}

// Old WordPress URLs that live redirected land on the same page here (#59).
describe('legacy URL stubs', () => {
  it.each(Object.entries(STUBS) as [string, [string, string]][])(
    '%s is a noindex redirect to %j',
    (from, target) => {
      const file = path.join(ROOT, 'public', from, 'index.html')
      expect(fs.readFileSync(file, 'utf8')).toBe(stubHtml(from, target))
      expect(isRoute(target[0])).toBe(true)
      expect(path.posix.join(from, relativeTarget(from, target[0]))).toBe(target[0])
    }
  )

  it('does not shadow a real page', () => {
    expect(Object.keys(STUBS).filter(isRoute)).toEqual([])
  })
})
