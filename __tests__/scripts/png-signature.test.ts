import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ESM module, so this runs it through node the way the other script tests do
 * rather than importing it into jest's transform pipeline.
 */
function evaluate(expression: string): unknown {
  const script = join(process.cwd(), 'scripts', 'png-signature.mjs')
  const result = spawnSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(script)});\nprocess.stdout.write(JSON.stringify(${expression}))`,
    ],
    { cwd: process.cwd(), encoding: 'utf8' }
  )

  if (result.status !== 0) {
    throw new Error(`node exited ${result.status}: ${result.stderr}`)
  }
  return JSON.parse(result.stdout)
}

/** `isPng(...)` over a byte array literal, evaluated in the module's own realm. */
function isPng(bytes: number[]): boolean {
  return evaluate(`m.isPng(Buffer.from(${JSON.stringify(bytes)}))`) as boolean
}

const VALID = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('isPng', () => {
  it('accepts the real signature', () => {
    expect(isPng(VALID)).toBe(true)
    expect(isPng([...VALID, 0x00, 0x00, 0x00, 0x0d])).toBe(true)
  })

  it('accepts a PNG this repo actually ships', () => {
    const bytes = [...readFileSync(join(process.cwd(), 'public', 'icon.png')).subarray(0, 16)]
    expect(isPng(bytes)).toBe(true)
  })

  // THE CASE THAT MOTIVATED THIS. The check these generators used to make was
  // bytes[1..3] === 'PNG', which is three ASCII letters and nothing else --
  // it passes for any buffer that happens to carry them at offset 1, and the
  // consequence is a non-PNG written into public/ and noticed in a browser
  // months later.
  it('rejects a buffer that merely contains the ASCII letters PNG', () => {
    const impostor = [0x00, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]

    // The old check passed this...
    expect(Buffer.from(impostor).subarray(1, 4).toString('latin1')).toBe('PNG')
    // ...and the current one does not.
    expect(isPng(impostor)).toBe(false)
  })

  // Each trailing byte is load-bearing: \r\n and \x1a are in the signature so
  // that a transport mangling line endings, or truncating at a DOS EOF,
  // corrupts the signature rather than the image. A check that ignored them
  // would accept exactly the corruption they were chosen to catch.
  it.each([4, 5, 6, 7])('rejects a signature corrupted at byte %i', (index) => {
    const corrupted = [...VALID]
    corrupted[index] = 0x00

    expect(isPng(corrupted)).toBe(false)
  })

  it('rejects a CRLF-mangled signature', () => {
    // \r\n rewritten to \n, which is what a text-mode transport does.
    expect(isPng([0x89, 0x50, 0x4e, 0x47, 0x0a, 0x1a, 0x0a])).toBe(false)
  })

  // Behaviour, not implementation. isPng carries no explicit length check:
  // Buffer.subarray clamps rather than throwing, so a short buffer is
  // compared as a short subarray and `equals` is false because the lengths
  // differ. An explicit `bytes.length >= 8 &&` was written first and removed
  // when mutation testing showed deleting it changed nothing. These cases
  // stay because callers depend on the outcome regardless of how it arises.
  it('rejects a buffer too short to hold a signature', () => {
    expect(isPng([])).toBe(false)
    expect(isPng(VALID.slice(0, 7))).toBe(false)
  })

  it('rejects things that are not buffers at all', () => {
    expect(evaluate('m.isPng(undefined)')).toBe(false)
    expect(evaluate('m.isPng(null)')).toBe(false)
    expect(evaluate("m.isPng('\\x89PNG\\r\\n\\x1a\\n')")).toBe(false)
    expect(evaluate('m.isPng(new Uint8Array([137,80,78,71,13,10,26,10]))')).toBe(false)
  })
})
