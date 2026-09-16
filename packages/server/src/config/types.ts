/**
 * The shape of an instance's configuration — what `parseConfig` produces and
 * every module reads. Declarations only; the reading, with its refusals, is
 * next door.
 */

import type { StoreDeclaration } from '../stores.js'

export type AuthMode = 'none' | 'oidc' | 'proxy'

export interface OidcConfig {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  /** Claim carrying group membership; roles are derived from it at each login. */
  readonly groupsClaim: string
  /** Groups allowed in at all. Empty means any authenticated user. */
  readonly allowedGroups: readonly string[]
  /**
   * Signs session cookies. Absent means one is generated per boot, which
   * signs everyone out on restart — fine for a single instance, wrong the
   * moment there are two behind a load balancer.
   */
  readonly sessionSecret?: string | undefined
  /**
   * How long a session lasts before the person signs in again, in ms.
   *
   * A CEILING, not a promise. The identity provider does not tell a client
   * how long its own session lasts — nothing in the discovery document says
   * it, and what the token exchange hands back are token lifetimes, not
   * session ones — so this number cannot be derived and has to be chosen.
   * Where a login left a refresh token behind, the provider's verdict cuts
   * the session short before this ceiling (see `SessionPayload.backed`).
   */
  readonly sessionTtlMs: number
  /**
   * Audiences to ask for, so a turn can act as the person who asked.
   *
   * Present means the login also requests `offline_access`, the refresh token
   * is kept per user, and a fresh access token carrying THEIR identity is
   * minted for each turn — which is what an MCP server serving somebody's own
   * data requires. Absent means Adestia signs people in and holds nothing.
   *
   * ⚠️ The audience is frozen into the grant at login: adding one here takes
   * effect at the next sign-in, never at a refresh.
   */
  readonly reboundAudience?: readonly string[] | undefined
}

export interface ProxyAuthConfig {
  /** Header the trusted reverse proxy sets. Nothing else is believed. */
  readonly userHeader: string
  readonly groupsHeader?: string | undefined
}

export interface AuthConfig {
  readonly mode: AuthMode
  readonly oidc?: OidcConfig | undefined
  readonly proxy?: ProxyAuthConfig | undefined
}

/**
 * The instance's language, when its operator has one in mind.
 *
 * Absent, the shell asks the BROWSER — so a household gets its own language
 * with no configuration, and a visitor gets theirs on the same instance.
 * Setting it here is how an operator overrules that.
 */
export interface WorkspaceConfig {
  /** The agent's home: instructions in its CLI's own dialect, plus content. */
  readonly root: string
  /**
   * The single store's folder — the shape of every instance before memory
   * could be composed of several. Kept, and kept meaningful: with no `stores`
   * declared it IS the one store, which is what makes the composition
   * backwards-compatible by construction rather than by care.
   */
  readonly pages: string
  /**
   * The stores this instance composes its memory from, in declaration order.
   *
   * Always at least one. Absent from the file, it holds a single store built
   * from `pages`, so an instance that never heard of stores answers exactly
   * what it answered before — the union of a one-element set being that set.
   */
  readonly stores: readonly StoreDeclaration[]
  readonly memory: string
  readonly planif: string
  /**
   * The permission bits to WITHHOLD from everything this instance creates —
   * the process umask, in octal, as a string.
   *
   * Absent means "leave it alone", and that is the right default: the umask
   * an operator's environment gives (0022 from a container runtime, whatever
   * a systemd unit says) is a decision they already made, and overruling it
   * silently is not this program's business.
   *
   * It exists for ONE situation, and it sits next to `stores` because that is
   * the situation: a store shared by two instances. A shared folder carries
   * the setgid bit, so a file created in it lands in the circle's group on its
   * own — but the group still needs the WRITE bit, and the usual 0022 removes
   * exactly that one. The result is the cruelest kind of half-working: both
   * bodies can CREATE, neither can EDIT the other's file, and nothing says so
   * until an edit is refused.
   *
   * `002` is the value that case wants. It cannot be fixed on the storage
   * instead: the mode travels in the create request, already masked, so a
   * server-side ACL can only remove bits further, never restore one the
   * client withheld (measured over NFS, 2026-08-20 — the file came out 0640).
   */
  readonly umask?: number
  readonly watch: WatchConfig
}

/**
 * The change feed over the pages tree (`/api/events`).
 *
 * On by default: the whole point of the product is that both hands write the
 * same files, and a shell that only notices the other hand on reload is
 * half-blind. `polling` exists because native file events cannot cross some
 * mount boundaries — WSL's `/mnt/c`, NFS, SMB, some Docker bind mounts — and
 * only the operator knows their workspace sits on one.
 */
export interface WatchConfig {
  readonly enabled: boolean
  readonly polling: boolean
  /** The scan period in polling mode; ignored with native events. */
  readonly intervalMs: number
}

export interface DriverConfig {
  readonly id: string
  /** Custom agent selected by drivers that support agent profiles. */
  readonly agent?: string | undefined
  readonly models: readonly { id: string; label?: string }[]
  /**
   * The binary to run, when the driver spawns one. Worth pinning to an exact
   * path in a container: the Copilot CLI self-updates, so "whatever is on
   * PATH" is not a version anyone can reason about.
   */
  readonly command?: string | undefined
  /**
   * How the driver hands the instance's own tools to the agent. `shell` is the
   * escape hatch for a CLI whose MCP servers are filtered against a corporate
   * registry: it delivers them over the socket via a small CLI on the execute
   * tool instead of a stdio MCP server. Only the copilot driver honours it.
   */
  readonly shellToolsTransport?: 'mcp' | 'shell' | undefined
}

export interface ExtensionsConfig {
  readonly pluginsDir: string
  readonly skinsDir: string
  /** Presence in a directory is discovery, never activation. */
  readonly apps: readonly string[]
  readonly features: readonly string[]
  readonly tools: readonly string[]
  readonly skin: string
}

/**
 * How much the agent asks before acting.
 *
 * Two postures and no dial in between, because the in-between is what was
 * removed in 2026-08-26: lists of tool names that judged nothing well and
 * could be walked around by a shell one-liner.
 *
 * - `open` — nothing is ever asked. What bounds the agent is the container,
 *   the MCP servers' own authorization, and the instructions somebody wrote.
 * - `ask` — the ENGINE's own first line decides (a `Read` is never asked
 *   about), and what it would have asked a terminal about reaches the chat
 *   instead. Adestia judges nothing; it carries the question and the answer.
 *
 * `ask` needs an engine that can be asked. On one that cannot, the instance
 * refuses to boot rather than turning every question into a silent refusal.
 */
export interface PermissionsConfig {
  readonly mode: 'open' | 'ask'
}

/**
 * Scheduled turns.
 *
 * OFF by default, deliberately. A note that runs the agent while nobody is
 * watching spends a subscription and acts on a workspace; that has to be
 * something an operator turned on, never something they inherited.
 */
export interface ScheduleConfig {
  readonly enabled: boolean
  readonly tickMs?: number | undefined
}

export interface AttachmentsConfig {
  readonly maxBytes: number
  readonly maxFiles: number
  /** Age past which an unclaimed attachment is swept, in ms. `0` never sweeps. */
  readonly ttlMs: number
}

/**
 * Inbound MCP: letting other agents delegate work here.
 *
 * Off by default and refused without a token. An endpoint other machines can
 * reach that runs agent turns is a remote shell; an instance must never grow
 * one because a setting was left blank.
 */
/**
 * An MCP server the agent may CALL — the outbound direction.
 *
 * Either a `command` (stdio, launched by the CLI) or a `url` (http), never
 * both: they are two transports, and a server declaring both leaves the driver
 * guessing which one an operator meant.
 *
 * `env` values go through the same `${VAR}` substitution as everything else,
 * so a token lives in the environment and the committed file holds the wiring.
 */
export interface McpServerConfig {
  readonly name: string
  /** `user` for a server that serves somebody's own data. See the contract. */
  readonly identity?: 'machine' | 'user' | undefined
  /**
   * `oauth` for a `user` server that is its OWN authorization server: each
   * person connects once through its interactive flow (the sign-in card, or
   * the settings tile), and their rotating refresh key does the rest. See
   * `mcp-signin.ts` and the driver contract's `signIn`.
   */
  readonly signIn?: 'oauth' | undefined
  readonly command?: string | undefined
  readonly args?: readonly string[] | undefined
  readonly url?: string | undefined
  readonly env?: Readonly<Record<string, string>> | undefined
  readonly headers?: Readonly<Record<string, string>> | undefined
  /**
   * Credentials for a hub that wants a short-lived OAuth token.
   *
   * The product mints and refreshes it per turn. Declared here rather than
   * pasted as a `headers.Authorization`, because a bearer written into a
   * config file works for one hour and then quietly stops.
   */
  readonly auth?: {
    readonly tokenUrl: string
    readonly clientId: string
    readonly clientSecret?: string | undefined
    /** A stored refresh token: uses the refresh_token grant (acts for a person). */
    readonly refreshToken?: string | undefined
    readonly scope?: string | undefined
    readonly audience?: string | undefined
  } | undefined
}

export interface McpInConfig {
  readonly enabled: boolean
  readonly token?: string | undefined
  readonly agentName: string
  /** What the ask tool says it is for, in a calling agent's tool list. */
  readonly description?: string | undefined
  readonly maxPending: number
  readonly ttlMs: number
}

export interface AdestiaConfig {
  readonly host: string
  readonly port: number
  readonly dataDir: string
  /**
   * What THIS instance is called — the household's, the workshop's.
   *
   * It names the browser tab and the install: the manifest's `name`, and the
   * document title an iPhone proposes when someone adds the page to their home
   * screen. A skin can already rename an install, and that covers two
   * instances wearing two liveries; it does nothing for two wearing the same
   * one, which is exactly the case an operator running a second Adestia hits.
   *
   * So it wins over the skin, and it is a FILE setting rather than an
   * environment one: the environment says where an instance runs, the file
   * says what it is, and a name is the plainest thing an instance is.
   *
   * Absent, the livery's name stands, and the product's under a bare instance.
   */
  readonly name?: string | undefined
  /** `fr`, `en`… Absent means: let the browser decide. */
  readonly locale?: string | undefined
  /**
   * Named secrets available to plugins that DECLARE them.
   *
   * Written as `NAME: ${ENV_VAR}` so the value stays in the environment and
   * the file an operator commits holds only the wiring. One entry serves
   * every plugin that names it — a key shared by two consumers is rotated in
   * one place.
   */
  readonly secrets: Readonly<Record<string, string>>
  readonly auth: AuthConfig
  readonly workspace: WorkspaceConfig
  readonly driver: DriverConfig
  readonly extensions: ExtensionsConfig
  readonly permissions: PermissionsConfig
  readonly schedule: ScheduleConfig
  readonly attachments: AttachmentsConfig
  readonly mcp: McpInConfig
  /**
   * Outbound MCP servers, the OPERATOR layer.
   *
   * One of three sources the design names, and the canonical one: a plugin may
   * bring its own, and the CLI's native config stays the user's business. This
   * layer wins a name conflict, loudly.
   */
  readonly mcpServers: readonly McpServerConfig[]
  /** Concurrent turns across all conversations. Subscription limits are real. */
  readonly maxConcurrentTurns: number
}
