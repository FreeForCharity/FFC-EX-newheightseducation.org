#!/usr/bin/env node
/**
 * One-off (#44): the converter's scopeCloneCss prefixes an at-rule that
 * follows a comment (`.ffc-clone /* latin *\/ @font-face{…}`, `.ffc-clone
 * @media …`), and then scopes the steps of a @keyframes it no longer
 * recognises (`.ffc-clone 0%`). Browsers drop both. This removes the prefix
 * from at-rule preludes and from keyframe steps in every linked stylesheet.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PREFIX = /^(\s*(?:\/\*[\s\S]*?\*\/\s*)*)\.ffc-clone\s+(?=(?:\/\*[\s\S]*?\*\/\s*)*@)/

export function repair(css) {
  let out = ''
  let buf = ''
  let depth = 0
  let keyframes = -1
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      const stop = end === -1 ? css.length : end + 2
      buf += css.slice(i, stop)
      i = stop - 1
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < css.length && css[j] !== ch) j += css[j] === '\\' ? 2 : 1
      buf += css.slice(i, j + 1)
      i = j
      continue
    }
    if (ch === '{') {
      let prelude = buf.replace(PREFIX, '$1')
      const bare = prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim()
      if (keyframes !== -1 && depth > keyframes) {
        prelude = prelude.replace(/\.ffc-clone\s+(?=[\d.]+%|from\b|to\b)/g, '')
      } else if (/^@(-[a-z]+-)?keyframes\b/i.test(bare)) {
        keyframes = depth
      }
      out += prelude + '{'
      buf = ''
      depth++
      continue
    }
    if (ch === '}') {
      out += buf + '}'
      buf = ''
      depth--
      if (keyframes !== -1 && depth <= keyframes) keyframes = -1
      continue
    }
    if (ch === ';' && depth === 0) {
      out += buf + ';'
      buf = ''
      continue
    }
    buf += ch
  }
  return out + buf
}

if (process.argv[1] === import.meta.filename) {
  const root = join(import.meta.dirname, '..', 'public')
  let changed = 0
  for (const sheet of process.argv.slice(2)) {
    const file = join(root, sheet)
    const css = readFileSync(file, 'utf8')
    const next = repair(css)
    if (next !== css) {
      writeFileSync(file, next)
      changed++
    }
  }
  console.log(`repaired ${changed} stylesheets`)
}
