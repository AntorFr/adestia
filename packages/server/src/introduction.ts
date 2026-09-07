/**
 * The shell introducing itself to its agent.
 *
 * Nothing used to. An agent asked how its own instance was configured
 * described an architecture it had guessed — fluent, wrong, and unaware the
 * shell existed at all. On a real deployment the answer named the PREDECESSOR
 * product, because the only prose that spoke about the environment was a brief
 * a person had written by hand, and hand-written prose about a running system
 * goes stale without ever announcing it.
 *
 * So the shell says it itself, and says it GENERATED: every fact below is read
 * off the configuration this process is running on, at the moment it delivers
 * the contract. A generated document cannot drift from what it describes — the
 * failure mode of the hand-written one is structurally absent rather than
 * watched for.
 *
 * Two halves, and they are separate on purpose:
 *
 *  - the CONTRACT (`instanceContract`) — the body, delivered as a skill like
 *    every other, readable in the instruction zone, costing nothing until it
 *    is opened;
 *  - the ANCHOR (`frameShell`) — one short line on every turn, because a
 *    contract is only read by an agent that suspects it exists, and the agent
 *    this fixes had no such suspicion.
 *
 * The anchor names the contract, and the contract is named once here, so the
 * two cannot come to disagree about what the file is called.
 */

import type { SkillFile } from './skills.js'
import type { Store } from './stores.js'

/** The folder the contract is delivered into, and the name the anchor cites. */
export const CONTRACT_NAME = 'this-instance'

/** One tool of the instance's own registry, as the contract lists it. */
export interface ToolFact {
  readonly name: string
  readonly description: string
}

/** One active plugin, as the contract lists it. */
export interface AppFact {
  readonly id: string
  readonly label: string
  readonly description: string
  /** The `type:` values it claims in frontmatter. Often none. */
  readonly types: readonly string[]
}

/**
 * What the running instance knows about itself.
 *
 * Assembled at the delivery site rather than read from the config here: the
 * config object is the SERVER's, and half of these facts (the tools actually
 * registered, the plugins actually active) are decisions taken after it was
 * parsed. Passing the answers keeps this module unable to disagree with what
 * the instance really did.
 */
export interface InstanceFacts {
  /** What the operator called this instance, when they called it anything. */
  readonly name?: string | undefined
  readonly locale?: string | undefined
  /** The engine id as configured — `claude-code`, `copilot-cli`. */
  readonly driverId: string
  readonly workspaceRoot: string
  readonly stores: readonly Store[]
  /** Workspace-relative, as configured. */
  readonly memory: string
  readonly planif: string
  /** The chat attachment inbox — absolute, and deliberately not in the workspace. */
  readonly inbox: string
  readonly tools: readonly ToolFact[]
  /** Outbound MCP servers this instance declares, by name. */
  readonly mcpServers: readonly string[]
  /** The name other agents delegate to, when the inbound channel is open. */
  readonly inboundName?: string | undefined
  readonly apps: readonly AppFact[]
}

/**
 * The line prefixed to every turn.
 *
 * Deliberately NOT the contract itself. Everything durable belongs in a file a
 * person can read and correct in the instruction zone; what has to travel with
 * every turn is only the fact that the file exists, because an engine loads a
 * skill's body on demand and demand is exactly what the confabulating agent
 * did not have.
 *
 * Applied at the turn desk, so it reaches a scheduled note and a delegated
 * task as well as a chat message — the unattended turns are the ones where a
 * guess is never contradicted by anybody.
 */
export function frameShell(prompt: string): string {
  return [
    `[You are running inside Adestia, the shell hosting this conversation. Its`,
    `\`${CONTRACT_NAME}\` contract, delivered with your skills, says what this`,
    `instance is, where its zones are, which tools are its own, and what it`,
    `cannot show you. Read it before answering anything about your own setup,`,
    `environment or configuration — never infer one.]`,
    '',
    prompt,
  ].join('\n')
}

/** A markdown table, or nothing at all when there is no row to draw. */
function table(header: string, rows: readonly string[]): string {
  return rows.length === 0 ? '' : `${header}\n${rows.join('\n')}\n`
}

/**
 * Where the content lives, told as paths because the agent works on files.
 *
 * A single-store instance says `pages` and stops. A composed one names the
 * stores contract instead of repeating it: two documents describing the same
 * division would be two documents to keep in agreement, and `memory-stores`
 * already carries the rule that matters (which store a new page goes to).
 */
function zones(facts: InstanceFacts): string {
  const rows = [
    `| the workspace | \`${facts.workspaceRoot}\` | your working directory — everything below is inside it unless said otherwise |`,
  ]

  if (facts.stores.length === 1) {
    rows.push(
      `| the pages | \`${facts.stores[0]!.dir}\` | the content both you and the reader edit: markdown files, drawn as pages in the interface |`,
    )
  } else {
    rows.push(
      `| the pages | ${facts.stores.length} stores | memory is composed of several folders here — see the \`memory-stores\` contract, which carries the rule for choosing between them |`,
    )
  }

  rows.push(
    `| \`${facts.memory}/\` | \`${facts.workspaceRoot}/${facts.memory}\` | what you write down to remember it |`,
    `| \`${facts.planif}/\` | \`${facts.workspaceRoot}/${facts.planif}\` | scheduled notes, whose body IS the prompt of a turn — see \`schedule-author\` |`,
    `| the attachment inbox | \`${facts.inbox}\` | files a person dropped in the chat. OUTSIDE the workspace, deliberately: nothing somebody sends you joins the content you curate until you file it there yourself |`,
  )

  return table('| Zone | Where | What it holds |\n|---|---|---|', rows)
}

/**
 * The tools that act on the product rather than on files.
 *
 * Listed as a SET, which is the part a tool description cannot say on its own:
 * an agent reading `rename_conversation` in a list of forty tools has no way
 * to tell that it touches the shell it is running in. Asked what it could do
 * to its own instance, one answered "nothing" while holding both of these.
 */
function tools(facts: InstanceFacts): string {
  if (facts.tools.length === 0) return ''
  const rows = facts.tools.map((tool) => `| \`${tool.name}\` | ${tool.description} |`)
  return `## The tools this shell hands you

These act on the INSTANCE — not on files, and not on the outside world. They
are yours alone: they reach organs no user and no other agent can call.

${table('| Tool | What it does |\n|---|---|', rows)}`
}

/** The apps drawn beside the chat, and the `type:` each one claims. */
function apps(facts: InstanceFacts): string {
  if (facts.apps.length === 0) return ''
  const rows = facts.apps.map((app) => {
    const claimed = app.types.length > 0 ? app.types.map((t) => `\`${t}\``).join(', ') : '—'
    return `| **${app.label}** (\`${app.id}\`) | ${claimed} | ${app.description} |`
  })
  return `## What this instance runs

Each of these draws pages in the interface, and reads them from the same files
you edit. The middle column is what it claims in \`type:\` — the flat namespace
\`page-author\` warns about, listed here so you can see what is taken before
you write an app or invent a type.

${table('| App | Claims `type:` | What it is |\n|---|---|---|', rows)}`
}

/** Who this instance talks to, and who talks to it. */
function neighbours(facts: InstanceFacts): string {
  const parts: string[] = []

  if (facts.mcpServers.length > 0) {
    parts.push(
      `**Servers this instance declares** — ${facts.mcpServers
        .map((name) => `\`${name}\``)
        .join(', ')}. Their tools appear among yours. What each one does is its own business and is not described here; the instance only wires them.`,
    )
  }

  if (facts.inboundName) {
    parts.push(
      `**Other agents can delegate work to you**, under the name \`${facts.inboundName}\`. Such a turn arrives framed as delegated and says so: nobody is reading it, and it cannot answer a question you ask back.`,
    )
  }

  return parts.length === 0 ? '' : `## Beyond this instance\n\n${parts.join('\n\n')}\n`
}

/**
 * The contract, generated from the facts above.
 *
 * Written as prose rather than a dump of the config: the agent needs to know
 * what it is inside of and where things are, not to be handed a serialised
 * settings object it would have to interpret. Every section that has nothing
 * to say is absent rather than empty — a division this instance does not have
 * must not be taught to its agent, or every turn carries a page of noise about
 * a shape it will never meet.
 */
export function instanceContract(facts: InstanceFacts): SkillFile {
  const called = facts.name ? `It is called **${facts.name}**.` : 'It has no name of its own.'
  const speaks = facts.locale
    ? ` Its language is \`${facts.locale}\`.`
    : ' Its language follows whoever is reading, so answer in the language you are addressed in.'

  const contents = `---
name: ${CONTRACT_NAME}
description: What runs you and where everything is — the shell hosting this conversation, this instance's zones on disk, the tools that are its own, and the facts it cannot show you. Read before answering anything about your own setup, environment or configuration.
---

# The shell that runs you

You are not in a terminal somebody opened. You run inside **Adestia** — a
self-hosted web interface that pairs a chat with visual apps over one workspace
of markdown files. Somebody reads your answers in a browser, and the files you
write are drawn there as pages, beside the conversation.

${called}${speaks}

It runs you through the \`${facts.driverId}\` engine: the shell spawns that CLI
for every turn, and you are the agent it starts.

**Everything below is generated from this instance's own configuration**, at
the moment this file was written — the last time the shell started. It
describes THIS instance, not Adestia in general and not what another instance
does.

## Where things are

${zones(facts)}
${apps(facts)}${tools(facts)}${neighbours(facts)}
## What you cannot see — and must not invent

**This instance's configuration file lives OUTSIDE the workspace.** You cannot
read it, nothing in the workspace mirrors it, and the parts of it that concern
you have been written into this file instead. Asked how this instance is
configured, name where the answer lives — the Settings screen, or whoever runs
the deployment — and stop there. A description that merely sounds plausible is
the exact failure this contract exists to prevent.

**The conversation you are shown was replayed by the shell.** Adestia stores
every thread itself and rebuilds it for any screen that opens it; the engine
session underneath is a separate thing, and it does not always survive a
restart. So a transcript may hold turns you have no memory of. When that
happens, say so — do not reconstruct what you would have said.

**A hand-written brief can be older than this file.** If \`CLAUDE.md\` or any
prose in this workspace contradicts what is written here — the name of the
product, where a folder is, which engine runs you — this file is the one
generated from the running instance, and this file is right.
`
  return { path: `${CONTRACT_NAME}/SKILL.md`, contents, source: 'core' }
}
