/**
 * The chat tranche's exit criterion, the parts read in files rather than seen on a screen
 * (adestia-qualite-chat: B-7, B-8, B-11, R-11, R-12). The expectations are the fiche's
 * « Critère de sortie », written here as literals; nothing is taken from what the code does.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { toMessage } from '../src/chat/messages.js'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path: string) => readFileSync(join(repo, path), 'utf8')
const SRC = 'packages/web/src'
const SHEETS = [`${SRC}/app/styles/chat.css`, `${SRC}/app/styles/conversations.css`, `${SRC}/app/styles/attachments.css`]

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
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

describe('chat sheets — chat.css, conversations.css, attachments.css (B-6 as the fiche states it)', () => {
  it('use no token that nothing defines (--text-xs and --radius-md were two)', () => {
    const defined = new Set<string>()
    for (const file of [...walk('packages', (f) => f.endsWith('.css')), ...walk('skins', (f) => f.endsWith('.css'))]) {
      for (const m of stripComments(read(file)).matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1] as string)
    }
    // custom properties set from code (style={{ '--x': … }}, setProperty)
    for (const file of walk(SRC, (f) => /\.(ts|tsx)$/.test(f))) {
      for (const m of read(file).matchAll(/['"`](--[a-z0-9-]+)['"`]\s*:|setProperty\(\s*['"`](--[a-z0-9-]+)/gi)) defined.add((m[1] ?? m[2]) as string)
    }
    const orphans: string[] = []
    for (const sheet of SHEETS) {
      const css = stripComments(read(sheet))
      for (const m of css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gi)) {
        if (!defined.has(m[1] as string)) orphans.push(`${sheet}:${lineOf(css, m.index ?? 0)} ${m[1]}${m[2] === ',' ? ' (with a fallback)' : ''}`)
      }
    }
    expect(orphans).toEqual([])
  })

  it('write no colour outside a var() fallback', () => {
    const found: string[] = []
    for (const sheet of SHEETS) {
      // a var(--x, <fallback>) may carry one colour; take those out, then nothing else may remain
      const css = stripComments(read(sheet)).replace(/var\(\s*--[a-z0-9-]+\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var(--x)')
      for (const m of css.matchAll(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![-\w])(?:white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|silver|navy|teal)(?![-\w])/gi)) {
        found.push(`${sheet}:${lineOf(css, m.index ?? 0)} ${m[0]}`)
      }
    }
    expect(found).toEqual([])
  })

  it('write no literal font size', () => {
    const found: string[] = []
    for (const sheet of SHEETS) {
      const css = stripComments(read(sheet))
      for (const m of css.matchAll(/font-size\s*:\s*([^;}]+)/gi)) {
        if (/[\d.]+(px|rem|em|pt)\b/.test((m[1] as string).replace(/var\([^)]*\)/g, ''))) found.push(`${sheet}:${lineOf(css, m.index ?? 0)} ${m[0].trim()}`)
      }
      for (const m of css.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/gi)) {
        if (/[\d.]+(px|rem|em|pt)\b/.test((m[1] as string).replace(/var\([^)]*\)/g, ''))) found.push(`${sheet}:${lineOf(css, m.index ?? 0)} ${m[0].trim()}`)
      }
    }
    expect(found).toEqual([])
  })

  it('write no literal radius (px, rem or em)', () => {
    const found: string[] = []
    for (const sheet of SHEETS) {
      const css = stripComments(read(sheet))
      for (const m of css.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/gi)) {
        if (/[\d.]*[1-9][\d.]*(px|rem|em)\b/.test((m[1] as string).replace(/var\([^)]*\)/g, ''))) found.push(`${sheet}:${lineOf(css, m.index ?? 0)} ${m[0].trim()}`)
      }
    }
    expect(found).toEqual([])
  })
})

describe('chat code — one request helper, one toMessage, short functions (R-11, R-12, B-11)', () => {
  it('calls fetchImpl( nowhere under packages/web/src/chat', () => {
    const hits = walk(`${SRC}/chat`, (f) => /\.(ts|tsx)$/.test(f)).flatMap((file) =>
      read(file)
        .split('\n')
        .flatMap((line, i) => (line.includes('fetchImpl(') ? [`${file}:${i + 1}`] : [])),
    )
    expect(hits).toEqual([])
  })

  it('defines toMessage once in packages/web/src', () => {
    const defs: string[] = []
    for (const file of walk(SRC, (f) => /\.(ts|tsx)$/.test(f))) {
      const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'toMessage') defs.push(file)
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'toMessage') defs.push(file)
        if ((ts.isMethodDeclaration(node) || ts.isPropertyAssignment(node)) && node.name.getText() === 'toMessage') defs.push(file)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(defs).toHaveLength(1)
  })

  it('has Delegations.tsx use that one toMessage', () => {
    const delegations = read(`${SRC}/app/Delegations.tsx`)
    expect(delegations).toMatch(/\btoMessage\(/)
  })

  it('keeps the signature cards for the chat by default and drops them for a delegated conversation', () => {
    const stored = {
      id: 'm1',
      at: '2026-10-01T09:00:00Z',
      role: 'agent' as const,
      text: 'Hello',
      signatures: [{ id: 'consent-1', kind: 'consent' as const, url: 'https://signatures.example.test/consent/consent-1', expiresAt: '2099-01-01T10:00:00Z' }],
    }
    expect(toMessage(stored).signatures).toEqual(stored.signatures)
    expect(toMessage(stored, {}).signatures).toEqual(stored.signatures)
    expect(toMessage(stored, { signatures: true }).signatures).toEqual(stored.signatures)
    expect(toMessage(stored, { signatures: false }).signatures).toBeUndefined()
    expect(toMessage(stored, { signatures: false })).toMatchObject({ id: 'm1', role: 'agent', text: 'Hello' })
  })

  it('keeps tools, stopped and error through toMessage, and adds nothing when they are absent', () => {
    const full = { id: 'm2', at: '2026-10-01T09:00:00Z', role: 'agent' as const, text: 'x', tools: [{ name: 'Read', target: 'a.md', ok: true }], stopped: true, error: 'boom' }
    expect(toMessage(full)).toEqual({ id: 'm2', role: 'agent', text: 'x', tools: [{ name: 'Read', target: 'a.md', ok: true }], stopped: true, error: 'boom' })
    expect(Object.keys(toMessage({ id: 'm3', at: '2026-10-01T09:00:00Z', role: 'user' as const, text: 'y' })).sort()).toEqual(['id', 'role', 'text'])
  })

  for (const file of ['Chat.tsx', 'useConversations.ts', 'Composer.tsx']) {
    it(`has no function of more than 250 lines in ${file}`, () => {
      const path = `${SRC}/chat/${file}`
      const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true)
      const long: string[] = []
      const visit = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
          const a = source.getLineAndCharacterOfPosition(node.getStart()).line
          const b = source.getLineAndCharacterOfPosition(node.getEnd()).line
          if (b - a + 1 > 250) long.push(`${file}:${a + 1} ${b - a + 1} lines`)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
      expect(long).toEqual([])
    })
  }
})
