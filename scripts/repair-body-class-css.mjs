#!/usr/bin/env node
/**
 * The converter scopes `.home .x` to `.ffc-clone .home .x`, but WordPress's
 * body classes sit on the .ffc-clone root itself, so every theme rule keyed
 * on one never matched (#62, #63). Astra's full-width page layout, Elementor
 * stretched sections and header button sizing were among them. Each such
 * prefix becomes `:is(.ffc-clone.home, .ffc-clone .home)`, which matches the
 * root as the live body did, keeps the same specificity, and still matches a
 * descendant. Also drops Popup Maker's open-popup scrollbar padding, which
 * lost its `html.pum-open` guard and padded every page. Safe to re-run.
 *
 *   node scripts/repair-body-class-css.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = join(ROOT, 'src', 'app')
const CONTENT = join(ROOT, 'src', 'clone-content')
const ASSETS = join(ROOT, 'public', '_ffc-assets')

const POPUP_PADDING =
  /\.ffc-clone\s*>\s*:not\(\[aria-modal=["']?true["']?\]\)\s*\{\s*padding-right:\s*15px;?\s*\}/g

export function repairBodyClassCss(css, bodyClasses) {
  return css
    .replace(POPUP_PADDING, '')
    .replace(
      /(?<!:is\(\.ffc-clone\.[\w-]+, )\.ffc-clone\s+\.(-?[_a-zA-Z][\w-]*)(?![\w-])/g,
      (all, cls) => (bodyClasses.has(cls) ? `:is(.ffc-clone.${cls}, .ffc-clone .${cls})` : all)
    )
}

const walk = (dir, test) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), test) : test(e.name) ? [join(dir, e.name)] : []
  )

/** Every class the pages put on their .ffc-clone root. */
export function bodyClassesOf(files) {
  const classes = new Set()
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/className="ffc-clone ([^"]*)"/g)) {
      for (const c of m[1].split(/\s+/)) if (c) classes.add(c)
    }
  }
  return classes
}

if (process.argv[1] === import.meta.filename) {
  const bodyClasses = bodyClassesOf(walk(APP, (n) => n === 'page.tsx'))
  let changed = 0
  for (const file of [
    ...walk(ASSETS, (n) => n.endsWith('.css')),
    ...walk(CONTENT, (n) => n.endsWith('.html')),
  ]) {
    const text = readFileSync(file, 'utf8')
    const next = repairBodyClassCss(text, bodyClasses)
    if (next !== text) {
      writeFileSync(file, next)
      changed++
    }
  }
  console.log(`Repaired body-class selectors in ${changed} files.`)
}
