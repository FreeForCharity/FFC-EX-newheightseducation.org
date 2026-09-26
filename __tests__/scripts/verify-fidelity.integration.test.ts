/**
 * @jest-environment node
 */
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * End to end over two real origins.
 *
 * The sibling suite pins the pure functions. This one is the only thing that
 * exercises the half that actually decides a deployment: fetch both origins,
 * compare, pick an exit code. It stands up a fake SOURCE and a fake EXPORT on
 * loopback and runs the CLI as a child process against them.
 *
 * It exists because a unit test cannot see the DIRECTION a defect pushes the
 * result. `</script >` -- a legal end tag the first version of `visibleText`
 * did not match -- left script bodies in the word count, and measured here
 * that scored a page which had lost 90% of its prose as healthy (scenario
 * "gutted export" below, exit 0 before the fix). A check that fails open is
 * worse than no check, and only a run that goes all the way to an exit code
 * shows which way it failed.
 */

const CLI = join(process.cwd(), 'scripts', 'verify-fidelity.mjs')

const words = (n: number, p = 'w') => Array.from({ length: n }, (_, i) => `${p}${i}`).join(' ')
const page = (title: string, body: string) =>
  `<html><head><title>${title}</title></head><body>${body}</body></html>`
/** A script closed with whitespace before the `>`. Legal HTML. */
const spacedScript = (n: number) => `<script>${words(n, 'js')}</script >`

type Bank = Record<string, string>

let fixture = ''
let sourcePages: Bank = {}
let exportPages: Bank = {}
let sourceServer: http.Server
let exportServer: http.Server
let sourceOrigin = ''
let exportOrigin = ''

const serve = (read: () => Bank) =>
  http.createServer((req, res) => {
    const body = read()[(req.url || '/').split('?')[0]]
    if (body === undefined) {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('not found')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(body)
  })

const listen = (srv: http.Server) =>
  new Promise<number>((resolve) =>
    srv.listen(0, '127.0.0.1', () =>
      resolve((srv.address() as import('node:net').AddressInfo).port)
    )
  )

/**
 * Async `spawn`, never `spawnSync`. The servers live in THIS process, so a
 * synchronous child blocks the event loop that has to answer its requests --
 * every scenario then reports "source unreachable", and the one scenario that
 * expects an unreachable source passes. That false green is how the first
 * draft of this harness read 1/5 instead of 0/5.
 */
const runCli = (args: string[]) =>
  new Promise<{ status: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, args)
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (status) => resolve({ status, out }))
  })

const compare = (source: Bank, exported: Bank) => {
  sourcePages = source
  exportPages = exported
  return runCli([
    CLI,
    '--source',
    sourceOrigin,
    '--export',
    exportOrigin,
    '--out',
    join(fixture, 'out'),
    '--clone-content',
    join(fixture, 'clone'),
    '--sample',
    '10',
    '--delay-ms',
    '0',
    '--timeout-ms',
    '5000',
    '--strict',
  ])
}

beforeAll(async () => {
  // `capturedRoutes` treats a built route as captured when a matching file
  // exists in clone-content, so the fixture has to carry both sides.
  fixture = mkdtempSync(join(tmpdir(), 'fidelity-it-'))
  for (const route of ['/', '/who-we-are/']) {
    const dir = join(fixture, 'out', route === '/' ? '' : route)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), '<html></html>')
    mkdirSync(join(fixture, 'clone'), { recursive: true })
    const stem = route === '/' ? 'index' : route.replace(/^\/|\/$/g, '')
    writeFileSync(join(fixture, 'clone', `${stem}.html`), '<html></html>')
  }
  sourceServer = serve(() => sourcePages)
  exportServer = serve(() => exportPages)
  sourceOrigin = `http://127.0.0.1:${await listen(sourceServer)}`
  exportOrigin = `http://127.0.0.1:${await listen(exportServer)}`
})

afterAll(async () => {
  await new Promise((r) => sourceServer.close(r))
  await new Promise((r) => exportServer.close(r))
  rmSync(fixture, { recursive: true, force: true })
})

jest.setTimeout(60_000)

describe('verify-fidelity CLI, source vs export', () => {
  // The false FAILURE. The source's own inline script closes `</script >`;
  // counting its 900 tokens as prose scored a perfectly reproduced page at
  // 100/1000 and failed it.
  it('passes a faithful page whose source script closes with whitespace', async () => {
    const { status, out } = await compare(
      {
        '/': page('Home | NHEG', `<p>${words(100)}</p>${spacedScript(900)}`),
        '/who-we-are/': page('Who We Are | NHEG', `<p>${words(100)}</p>`),
      },
      {
        '/': page('Home', `<p>${words(100)}</p>`),
        '/who-we-are/': page('Who We Are', `<p>${words(100)}</p>`),
      }
    )
    expect(out).not.toMatch(/kept \d+% of the source/)
    expect(status).toBe(0)
  })

  // The false PASS, and the reason this file exists. The export lost 90% of
  // its prose and padded the count with a spaced-close script body.
  it('fails an export that lost its text but carries a whitespace-closed script', async () => {
    const { status, out } = await compare(
      {
        '/': page('Home | NHEG', `<p>${words(500)}</p>`),
        '/who-we-are/': page('Who We Are | NHEG', `<p>${words(500)}</p>`),
      },
      {
        '/': page('Home', `<p>${words(50)}</p>${spacedScript(900)}`),
        '/who-we-are/': page('Who We Are', `<p>${words(500)}</p>`),
      }
    )
    expect(out).toMatch(/kept 10% of the source/)
    expect(status).toBe(1)
  })

  // #1370: the export served the publications page as the home page.
  it('fails when the export serves a different page than the source', async () => {
    const { status, out } = await compare(
      {
        '/': page(
          'Student Support Services | New Heights Educational Group | Ohio',
          `<p>${words(300)}</p>`
        ),
        '/who-we-are/': page('Who We Are | NHEG', `<p>${words(300)}</p>`),
      },
      {
        '/': page('New Heights Educational Group Publications', `<p>${words(300)}</p>`),
        '/who-we-are/': page('Who We Are', `<p>${words(300)}</p>`),
      }
    )
    expect(out).toMatch(/different page/)
    expect(status).toBe(1)
  })

  // After DNS cutover the source domain serves the export. Exit 2, never a
  // perfect score forever.
  it('refuses to score once the source is serving the export', async () => {
    const clone = page('Home', '<div class="ffc-clone home"><p>x</p></div>')
    const { status, out } = await compare({ '/': clone }, { '/': clone })
    expect(out).toMatch(/already serving the FFC export/)
    expect(status).toBe(2)
  })

  it('treats an unreachable source as no comparison, not as a pass', async () => {
    const { status, out } = await compare({}, { '/': page('Home', `<p>${words(100)}</p>`) })
    expect(out).toMatch(/unreachable/)
    expect(status).toBe(2)
  })
})
