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

  it('asks before a custom agent profile is written', () => {
    // Copilot's `.github/agents/*.agent.md` reads as documentation and grants
    // tools: its frontmatter carries `tools` and `mcp-servers`. A turn that
    // rewrote the profile an operator selected would be handing itself reach
    // nobody granted, on the next turn, in a file that looks like prose.
    const copilot = authorityEditRule(ROOT, ['.github/agents', '.github/mcp.json'])
    expect(copilot(write(`${ROOT}/.github/agents/reviewer.agent.md`))).toBe('ask')
    // Skills sit next door and stay ungoverned on purpose — they say what to
    // do, never what one may reach.
    expect(copilot(write(`${ROOT}/.github/skills/x/SKILL.md`))).toBeUndefined()
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

describe('routing a request to its conversation', () => {
  it('stamps a waiting request, and forgets an answered one', async () => {
    // Only the shell knows which conversation a turn belongs to; the driver
    // knows a session id. So the two are attached separately.
    const broker = new PermissionBroker({ whenUnattended: 'deny' })
    const asked: PermissionRequest[] = []
    const decision = broker.ask('Edit', '/w/pages/x.md', (r) => {
      asked.push(r)
      return true
    })
    await vi.waitFor(() => expect(asked).toHaveLength(1))

    broker.attach(asked[0]!.id, { userId: 'sebastien', conversationId: 'conv-42' })
    expect(broker.outstanding()[0]?.conversationId).toBe('conv-42')

    broker.answer(asked[0]!.id, 'allow', 'sebastien')
    await decision
    // Nothing left to route: attaching to a request that is gone is a no-op,
    // not a crash — the UI may well be a moment behind.
    expect(() => broker.attach(asked[0]!.id, { conversationId: 'conv-99' })).not.toThrow()
    expect(broker.outstanding()).toHaveLength(0)
  })
})

describe('two people on one instance', () => {
  /** Raises a request and returns its id, as a driver would. */
  const raise = async (broker: PermissionBroker) => {
    const asked: PermissionRequest[] = []
    void broker.ask('Edit', '/w/pages/x.md', (r) => {
      asked.push(r)
      return true
    })
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    return asked[0]!.id
  }

  it('shows each person only what their own turn is waiting on', async () => {
    // One broker serves the whole instance. Unfiltered, "what is waiting"
    // hands somebody else's tool names and file paths to whoever asks first.
    const broker = new PermissionBroker({ whenUnattended: 'deny' })
    broker.attach(await raise(broker), { userId: 'sebastien', conversationId: 'c1' })
    broker.attach(await raise(broker), { userId: 'emilie', conversationId: 'c2' })

    expect(broker.outstanding('sebastien').map((r) => r.conversationId)).toEqual(['c1'])
    expect(broker.outstanding('emilie').map((r) => r.conversationId)).toEqual(['c2'])
    // Unnarrowed stays available for the server's own bookkeeping.
    expect(broker.outstanding()).toHaveLength(2)
  })

  it('refuses to let one answer for the other', async () => {
    const broker = new PermissionBroker({ whenUnattended: 'deny' })
    const id = await raise(broker)
    broker.attach(id, { userId: 'sebastien' })

    // As if it were not there: saying "not yours" would confirm a request
    // exists, which is itself an answer.
    expect(broker.answer(id, 'allow', 'emilie')).toBe(false)
    expect(broker.outstanding('sebastien')).toHaveLength(1)
    expect(broker.answer(id, 'allow', 'sebastien')).toBe(true)
  })

  it('shows an unclaimed request to nobody', async () => {
    // A turn with no caller — the clock, a delegation — raises requests that
    // belong to no one. They are decided by the unattended policy, never by
    // whoever happens to be looking.
    const broker = new PermissionBroker({ whenUnattended: 'deny' })
    await raise(broker)
    expect(broker.outstanding('sebastien')).toHaveLength(0)
  })
})

describe('a conversation that goes away', () => {
  it('stops waiting on anybody, and frees the turn', async () => {
    // Archived, its turn would otherwise sit on one of the instance's slots
    // until it timed out — for a thread nobody is looking at any more.
    const broker = new PermissionBroker({ whenUnattended: 'allow' })
    const asked: PermissionRequest[] = []
    const decision = broker.ask('Edit', '/w/pages/x.md', (r) => {
      asked.push(r)
      return true
    })
    await vi.waitFor(() => expect(asked).toHaveLength(1))
    broker.attach(asked[0]!.id, { userId: 'sebastien', conversationId: 'c1' })

    expect(broker.abandon('c1')).toBe(1)
    // DENIED, not left to the unattended policy — which this instance has set
    // to allow. Archiving is a person acting; the unattended policy answers
    // for turns nobody is watching, and that is a different situation.
    expect(await decision).toBe('deny')
    expect(broker.outstanding()).toHaveLength(0)
  })

  it('leaves the other threads waiting', async () => {
    const broker = new PermissionBroker({ whenUnattended: 'deny' })
    const ids: string[] = []
    for (const conversation of ['c1', 'c2']) {
      const asked: PermissionRequest[] = []
      void broker.ask('Edit', '/w/x.md', (r) => {
        asked.push(r)
        return true
      })
      await vi.waitFor(() => expect(asked).toHaveLength(1))
      broker.attach(asked[0]!.id, { conversationId: conversation })
      ids.push(asked[0]!.id)
    }

    expect(broker.abandon('c1')).toBe(1)
    expect(broker.outstanding().map((r) => r.conversationId)).toEqual(['c2'])
    expect(ids).toHaveLength(2)
  })

  it('says nothing was waiting when nothing was', async () => {
    expect(new PermissionBroker().abandon('jamais-vue')).toBe(0)
  })
})
