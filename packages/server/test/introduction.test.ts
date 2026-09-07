import { describe, expect, it } from 'vitest'

import {
  CONTRACT_NAME,
  frameShell,
  instanceContract,
  type InstanceFacts,
} from '../src/introduction.js'
import { resolveStores } from '../src/stores.js'

/** The plainest instance there is: one store, no neighbours, no apps. */
function facts(over: Partial<InstanceFacts> = {}): InstanceFacts {
  const { stores } = resolveStores([{ id: 'perso', path: 'pages' }], '/w')
  return {
    driverId: 'claude-code',
    workspaceRoot: '/w',
    stores,
    memory: 'memory',
    planif: 'planif',
    inbox: '/data/inbox',
    tools: [],
    mcpServers: [],
    apps: [],
    ...over,
  }
}

describe('the contract', () => {
  it('names the product, so an agent asked what runs it has an answer to read', async () => {
    // The failure this file exists for, in one assertion: an agent on a real
    // deployment named the PREDECESSOR product when asked what its interface
    // was, because the only prose about its environment was hand-written and
    // had outlived the migration.
    const contract = instanceContract(facts())
    expect(contract.contents).toContain('Adestia')
    expect(contract.contents).toContain('claude-code')
    expect(contract.source).toBe('core')
  })

  it('is delivered under the name the anchor cites', () => {
    // The one coupling that must never come apart: an anchor telling the agent
    // to read a file that is delivered under another name sends it looking for
    // something that is not there — which is worse than silence, because it
    // reads as "the shell lied" rather than "nobody said".
    expect(instanceContract(facts()).path).toBe(`${CONTRACT_NAME}/SKILL.md`)
    expect(frameShell('x')).toContain(CONTRACT_NAME)
  })

  it('gives the zones as paths, because the agent works on files', () => {
    const contract = instanceContract(facts())
    expect(contract.contents).toContain('/w/memory')
    expect(contract.contents).toContain('/w/planif')
    // The inbox is the one place deliberately NOT in the workspace, and the
    // sentence has to say so or the agent files a dropped photo into content.
    expect(contract.contents).toContain('/data/inbox')
    expect(contract.contents).toContain('OUTSIDE the workspace')
  })

  it('names the single store on a plain instance', () => {
    expect(instanceContract(facts()).contents).toContain('/w/pages')
  })

  it('defers to the stores contract rather than repeating it', () => {
    // Two documents describing the same division are two documents to keep in
    // agreement. `memory-stores` already carries the rule that matters.
    const { stores } = resolveStores(
      [
        { id: 'perso', path: '/w/pages' },
        { id: 'famille', path: '/shared/voyage', at: 'voyages/famille' },
      ],
      '/w',
    )
    const contract = instanceContract(facts({ stores }))
    expect(contract.contents).toContain('memory-stores')
    expect(contract.contents).not.toContain('/shared/voyage')
  })

  it('lists the shell tools as a set, which no single description can say', () => {
    // Asked what it could do to its own instance, an agent holding both of
    // these answered "nothing": a tool description says what a tool does, and
    // never that it touches the shell the agent is running in.
    const contract = instanceContract(
      facts({
        tools: [
          { name: 'rename_conversation', description: 'Rename this conversation.' },
          { name: 'new_id', description: 'Mint a ULID.' },
        ],
      }),
    )
    expect(contract.contents).toContain('rename_conversation')
    expect(contract.contents).toContain('new_id')
    expect(contract.contents).toContain('act on the INSTANCE')
  })

  it('says what it cannot see, which is the half whose absence produced the guess', () => {
    const contract = instanceContract(facts())
    expect(contract.contents).toContain('OUTSIDE the workspace')
    expect(contract.contents).toContain('Settings screen')
    // And the amnesia: a thread the shell replays faithfully over an engine
    // session that died with the pod.
    expect(contract.contents).toContain('replayed by the shell')
  })

  it('claims precedence over hand-written prose, because that is what went stale', () => {
    expect(instanceContract(facts()).contents).toContain('CLAUDE.md')
  })

  it('names the apps and the types they claim, so a new one collides on purpose', () => {
    const contract = instanceContract(
      facts({
        apps: [
          { id: 'todo', label: 'Todo', description: 'Tasks as pages.', types: ['tache', 'liste'] },
        ],
      }),
    )
    expect(contract.contents).toContain('Todo')
    expect(contract.contents).toContain('`tache`')
  })

  it('names the servers this instance wires, and who may delegate to it', () => {
    const contract = instanceContract(
      facts({ mcpServers: ['rosetta'], inboundName: 'alfred' }),
    )
    expect(contract.contents).toContain('rosetta')
    expect(contract.contents).toContain('alfred')
  })

  it('omits every section this instance has nothing to say in', () => {
    // Rule seven applied to prose: a shape this instance does not have must
    // not be taught to its agent, or every reading carries noise about
    // something it will never meet.
    const contract = instanceContract(facts())
    expect(contract.contents).not.toContain('The tools this shell hands you')
    expect(contract.contents).not.toContain('Beyond this instance')
    expect(contract.contents).not.toContain('What this instance runs')
  })

  it('says a nameless instance is nameless rather than inventing a name', () => {
    expect(instanceContract(facts()).contents).toContain('no name of its own')
    expect(instanceContract(facts({ name: 'Atelier' })).contents).toContain('**Atelier**')
  })

  it('tells an instance with no declared language to follow its reader', () => {
    // The shell asks the browser when the operator set none, which is what
    // lets one instance answer two visitors in their own languages.
    expect(instanceContract(facts()).contents).toContain('language you are addressed in')
    expect(instanceContract(facts({ locale: 'fr' })).contents).toContain('`fr`')
  })
})

describe('the anchor', () => {
  it('keeps the prompt it frames', () => {
    expect(frameShell('quelle heure est-il ?')).toContain('quelle heure est-il ?')
  })

  it('says where to read rather than carrying the contract itself', () => {
    // Everything durable belongs in a file a person can read and correct. What
    // travels on every turn is only the fact that the file exists — the agent
    // this fixes had no reason to suspect it did.
    const framed = frameShell('x')
    expect(framed).toContain('Adestia')
    expect(framed.length).toBeLessThan(500)
  })
})
