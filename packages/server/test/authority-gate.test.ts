/**
 * The authority gate.
 *
 * What is asserted is the property the whole thing exists for: a write to a
 * file that decides what the agent MAY DO asks a person, even on an instance
 * that has told its file tools to go ahead. Everything else about this rule is
 * detail; that one sentence is the feature.
 */

import { sep } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { PermissionBroker, type PermissionRequest } from '@antorfr/golem-drivers'

import { authorityEditRule, chainEditRules } from '../src/authority-gate.js'

const ROOT = `${sep}workspace`
const CLAUDE = ['.claude/settings.json', '.claude/hooks', '.mcp.json']

const write = (path: string) => ({ kind: 'write' as const, path, content: '{}' })

describe('the guarded zone', () => {
  const rule = authorityEditRule(ROOT, CLAUDE)

  it('asks before a file that decides permissions is written', () => {
    expect(rule(write(`${ROOT}/.claude/settings.json`))).toBe('ask')
    expect(rule(write(`${ROOT}/.mcp.json`))).toBe('ask')
  })

  it('covers what a guarded folder will hold tomorrow', () => {
    // The dangerous hook is precisely the one that does not exist yet, so the
    // zone is the folder rather than the files currently in it.
    expect(rule(write(`${ROOT}/.claude/hooks/pre-tool-use.sh`))).toBe('ask')
    expect(rule(write(`${ROOT}/.claude/hooks/nested/deep.json`))).toBe('ask')
  })

  it('says nothing about ordinary content', () => {
    // `undefined`, not `allow`: this rule has no opinion outside its zone, and
    // an opinion there would override the policy that does have one.
    expect(rule(write(`${ROOT}/pages/sante/dietetique.md`))).toBeUndefined()
    expect(rule(write(`${ROOT}/.claude/skills/page-author/SKILL.md`))).toBeUndefined()
  })

  it('does not guard a neighbour whose name merely starts the same way', () => {
    // `.mcp.json` must not drag `.mcp.json.bak` in, nor `.claude/hooks` claim
    // a sibling called `.claude/hooks-notes.md`.
    expect(rule(write(`${ROOT}/.mcp.json.bak`))).toBeUndefined()
    expect(rule(write(`${ROOT}/.claude/hooks-notes.md`))).toBeUndefined()
  })

  it('is silent when the driver declares no zone', () => {
    expect(authorityEditRule(ROOT, [])(write(`${ROOT}/.claude/settings.json`))).toBeUndefined()
  })
})

describe('chained rules', () => {
  it('takes the first answer, and asks the next only when there is none', async () => {
    const first = vi.fn(() => undefined)
    const second = vi.fn(() => 'ask' as const)
    const third = vi.fn(() => 'allow' as const)
    const chained = chainEditRules(first, second, third)

    expect(await chained(write('/x'))).toBe('ask')
    expect(first).toHaveBeenCalled()
    expect(second).toHaveBeenCalled()
    // Not consulted: an earlier rule already answered.
    expect(third).not.toHaveBeenCalled()
  })

  it('answers nothing when no rule has an opinion', async () => {
    expect(await chainEditRules(() => undefined, () => undefined)(write('/x'))).toBeUndefined()
  })
})

describe('against a broker that trusts its file tools', () => {
  /** The beta's real policy: writing is auto-allowed everywhere. */
  const policy = {
    autoAllow: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    whenUnattended: 'deny' as const,
    decideEdit: chainEditRules(authorityEditRule(ROOT, CLAUDE)),
  }

  it('lets an ordinary write through without asking anyone', async () => {
    const broker = new PermissionBroker(policy)
    const emit = vi.fn((_request: PermissionRequest) => true)
    const decision = await broker.ask('Write', `${ROOT}/pages/note.md`, emit, write(`${ROOT}/pages/note.md`))
    expect(decision).toBe('allow')
    expect(emit).not.toHaveBeenCalled()
  })

  it('stops at the authority zone, autoAllow notwithstanding', async () => {
    // THE point of this file. Without the rule piercing `autoAllow`, an
    // instance that trusts its file tools hands the agent its own leash.
    const broker = new PermissionBroker(policy)
    const asked: PermissionRequest[] = []
    const emit = vi.fn((request: PermissionRequest) => {
      asked.push(request)
      return true
    })
    const target = `${ROOT}/.claude/settings.json`
    const decision = broker.ask('Write', target, emit, write(target))
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    broker.answer(asked[0]!.id, 'deny')
    expect(await decision).toBe('deny')
  })

  it('denies with nobody watching, rather than waiting for a person who is not there', async () => {
    // A scheduled turn, an MCP delegation: the unattended policy answers.
    const broker = new PermissionBroker(policy)
    const target = `${ROOT}/.claude/hooks/x.sh`
    expect(await broker.ask('Write', target, () => false, write(target))).toBe('deny')
  })
})
