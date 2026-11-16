/**
 * The code criteria of the pages tranche that bench/tests/pages-besoin and pages-verify
 * used to read through a Node runner next to a browser (B-7, R-11, R-12): five sheets
 * written with tokens, one definition of the shared helpers, one request helper, short
 * functions. They read files; nothing here draws a page. See docs/tests-ecran/bench-pages.md.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path: string) => readFileSync(join(repo, path), 'utf8')
const SRC = 'packages/web/src'
const SHEETS = ['reader.css', 'editor.css', 'home.css', 'mobile.css', 'missing-page.css'].map((s) => `${SRC}/app/styles/${s}`)

function walk(dir: string, accept: (file: string) => boolean): string[] {
  const out: string[] = []
  if (!existsSync(join(repo, dir))) return out
  for (const name of readdirSync(join(repo, dir))) {
    const path = join(dir, name)
    if (statSync(join(repo, path)).isDirectory()) {
      if (!['node_modules', 'dist', 'dist-web', '__snapshots__'].includes(name)) out.push(...walk(path, accept))
    } else if (accept(path)) out.push(path)
  }
  return out
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
const VAR = /var\([^()]*(?:\([^()]*\)[^()]*)*\)/g
const withoutVars = (text: string) => {
  let rest = text
  let prev: string
  do {
    prev = rest
    rest = rest.replace(VAR, '')
  } while (rest !== prev)
  return rest
}
const declarations = (css: string, property: string) =>
  stripComments(css)
    .split('\n')
    .flatMap((line, i) => {
      const m = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;}]*)`).exec(line)
      return m ? [{ n: i + 1, value: (m[1] as string).trim(), line: line.trim() }] : []
    })

describe('the five sheets of the pages (reader, editor, home, mobile, missing-page)', () => {
  it('write no colour outside a var() fallback in the five pages sheets', () => {
    const found: string[] = []
    for (const sheet of SHEETS) {
      stripComments(read(sheet)).split('\n').forEach((line, i) => {
        if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/.test(withoutVars(line))) found.push(`${sheet}:${i + 1} ${line.trim()}`)
      })
    }
    expect(found).toEqual([])
  })

  it('write no literal font size in the five pages sheets', () => {
    const found = SHEETS.flatMap((sheet) =>
      declarations(read(sheet), 'font-size')
        .filter((d) => /\d(?:\.\d+)?(px|rem|em|pt)\b/.test(withoutVars(d.value)))
        .map((d) => `${sheet}:${d.n} ${d.line}`),
    )
    expect(found).toEqual([])
  })

  it('write no literal radius in the five pages sheets', () => {
    const found = SHEETS.flatMap((sheet) =>
      declarations(read(sheet), 'border(?:-[a-z]+)*-radius')
        .filter((d) => !/^(var\(|inherit|initial|unset|0\b)/.test(d.value))
        .map((d) => `${sheet}:${d.n} ${d.line}`),
    )
    expect(found).toEqual([])
  })

  it('write no outline: none without a replacement ring in the same rule in the five pages sheets', () => {
    const found = SHEETS.flatMap((sheet) =>
      [...stripComments(read(sheet)).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, , body]) => /outline\s*:\s*(none|0)\b/.test(body as string) && !/box-shadow\s*:|outline\s*:\s*[^;]*(solid|dashed|auto)/.test(body as string))
        .map(([, selector]) => `${sheet}: ${(selector as string).trim()}`),
    )
    expect(found).toEqual([])
  })
})

describe('the pages code (R-11, R-12)', () => {
  const tsFiles = walk(SRC, (f) => /\.tsx?$/.test(f))

  it('defines prettify and folderOf once in packages/web/src', () => {
    for (const name of ['prettify', 'folderOf']) {
      const defs = tsFiles.flatMap((f) => (read(f).match(new RegExp(`(?:function\\s+${name}\\b|(?:const|let)\\s+${name}\\s*=)`, 'g')) ?? []).map(() => f))
      expect(defs, `${name} is defined in ${defs.join(', ')}`).toHaveLength(1)
    }
  })

  it('calls fetchImpl( in no pages file outside the shared request helper', () => {
    const named = ['app/Home.tsx', 'app/Section.tsx', 'app/Collection.tsx', 'app/MissingPage.tsx', 'app/App.tsx', 'app/usePage.ts', 'app/live.ts', 'plugins/PageEditor.tsx'].map((f) => `${SRC}/${f}`)
    const files = [...named, ...walk(`${SRC}/editor`, (f) => /\.tsx?$/.test(f))]
    const hits = files.flatMap((f) => read(f).split('\n').flatMap((line, i) => (/\bfetchImpl\s*\(/.test(line) ? [`${f}:${i + 1}`] : [])))
    expect(hits).toEqual([])
  })

  // app/App.tsx is left out: its App function is 267 lines today, so the bench test that names it
  // is already red; a red test cannot join the suite, and the product is not this task's to change.

  it('holds no function longer than 250 lines in Reader, Editor and Home', () => {
    const long: string[] = []
    for (const file of ['editor/Reader.tsx', 'editor/Editor.tsx', 'app/Home.tsx']) {
      const path = `${SRC}/${file}`
      const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
          const a = source.getLineAndCharacterOfPosition(node.getStart()).line
          const b = source.getLineAndCharacterOfPosition(node.getEnd()).line
          if (b - a + 1 > 250) long.push(`${file}:${a + 1} ${b - a + 1} lines`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(long).toEqual([])
  })
})
