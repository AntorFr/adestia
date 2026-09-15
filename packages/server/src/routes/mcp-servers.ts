/**
 * The outbound MCP servers — what the engine reaches, as the interface sees
 * and edits them: their health, their wiring, who owns each, and the sign-in
 * flow for the ones that are their own authorization server.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Driver, DriverDescriptor, McpStatus } from '@antorfr/adestia-drivers'

import { readMcpServer, type AdestiaConfig, type McpServerConfig } from '../config.js'
import type { DiscoveredPlugin } from '../extensions.js'
import { maskServer, unmaskServer, type McpServerView, type McpStore } from '../mcp-store.js'
import type { McpSignIn } from '../mcp-signin.js'
import { identityOf } from './identity.js'

export interface McpServersDependencies {
  readonly config: AdestiaConfig
  readonly driver: Driver
  readonly descriptor: DriverDescriptor
  readonly plugins: readonly DiscoveredPlugin[]
  readonly mcpStore: McpStore
  readonly mcpSignIn: McpSignIn
  readonly outboundServers: () => Promise<readonly McpServerConfig[]>
}

/**
 * Every outbound server, credentials INCLUDED — the callback verifier's and
 * the turn's view, never a route's answer. Same precedence as the listing
 * below: config, then plugins, then the shell's own layer, first name wins.
 */
export function outboundServersOf({
  config,
  plugins,
  mcpStore,
}: Pick<McpServersDependencies, 'config' | 'plugins' | 'mcpStore'>): () => Promise<
  readonly McpServerConfig[]
> {
  return async () => {
    const merged: McpServerConfig[] = []
    const declared = new Set<string>()
    for (const server of [
      ...config.mcpServers,
      ...plugins.flatMap((plugin) => (plugin.active ? (plugin.manifest.mcpServers ?? []) : [])),
      ...(await mcpStore.list()),
    ]) {
      if (declared.has(server.name)) continue
      declared.add(server.name)
      merged.push(server)
    }
    return merged
  }
}

export function registerMcpServers(app: FastifyInstance, deps: McpServersDependencies): void {
  const { config, driver, descriptor, plugins, mcpStore, mcpSignIn, outboundServers } = deps

  /**
   * What the outbound MCP servers are doing.
   *
   * Same gate and same 404 as the models route: "this driver cannot report"
   * and "this instance has no servers" are different facts, and a panel that
   * cannot tell them apart shows an empty box for both.
   */
  app.get('/api/mcp/status', async (_request, reply) => {
    if (!descriptor.capabilities.includes('mcpStatus')) {
      await reply.code(404).send({ error: 'this driver does not report MCP health' })
      return reply
    }
    return { servers: await (driver as Driver & McpStatus).mcpStatus() }
  })

  /**
   * Every outbound server this instance knows about, and who owns it.
   *
   * `/api/mcp/status` answers "what are they doing"; this answers "what are
   * they, and which of them may I touch". Two routes rather than one because
   * health is a driver CAPABILITY that legitimately 404s, while the wiring is
   * always knowable — folding them together would have made a screen that can
   * add a server disappear on an engine that cannot report on one.
   */
  const mcpViews = async (): Promise<readonly McpServerView[]> => {
    const views: McpServerView[] = []
    const declared = new Set<string>()

    for (const server of config.mcpServers) {
      declared.add(server.name)
      views.push({
        name: server.name,
        source: 'config',
        editable: false,
        transport: server.url ? 'http' : 'stdio',
        config: maskServer(server),
      })
    }
    for (const plugin of plugins) {
      if (!plugin.active) continue
      for (const server of plugin.manifest.mcpServers ?? []) {
        if (declared.has(server.name)) continue
        declared.add(server.name)
        views.push({
          name: server.name,
          source: 'plugin',
          owner: plugin.manifest.id,
          editable: false,
          transport: server.url ? 'http' : 'stdio',
          config: maskServer(server),
        })
      }
    }
    for (const server of await mcpStore.list()) {
      views.push({
        name: server.name,
        source: 'ui',
        editable: true,
        transport: server.url ? 'http' : 'stdio',
        config: maskServer(server),
        // A name the config or a plugin took AFTER this one was added. The
        // write path refuses a collision, so this can only happen when a
        // file was edited behind us — and a row that quietly did nothing
        // would be the worst possible way to find that out.
        ...(declared.has(server.name) ? { shadowed: true } : {}),
      })
    }
    return views
  }

  app.get('/api/mcp/servers', async () => ({ servers: await mcpViews() }))

  /**
   * The sign-in surface: which sign-in servers exist, and whether THIS person
   * is connected. Its own route rather than a field on `/api/mcp/servers`
   * because the chat polls it around the card, and the card has no business
   * receiving every server's whole masked declaration each time.
   */
  app.get('/api/mcp/connections', async (request) => ({
    connections: await mcpSignIn.stateFor(await outboundServers(), identityOf(request).userId),
  }))

  /**
   * The instance's own origin, as the person's browser reached it.
   *
   * The redirect back from the authorization server must land on the SAME
   * origin the person is browsing, and behind an ingress the socket knows
   * nothing about it: the forwarded headers do. Derived per request rather
   * than configured, because the person clicking IS on the right origin by
   * construction.
   */
  const originOf = (request: FastifyRequest): string => {
    const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? request.protocol
    const host =
      (request.headers['x-forwarded-host'] as string | undefined) ?? request.headers.host ?? ''
    return `${proto}://${host}`
  }

  /** A tiny page for the end of the flow — the tab closes itself where the
      browser allows it, and says what happened where it does not. */
  const signinPage = (title: string, detail: string) =>
    `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<body style="font-family:system-ui;display:grid;place-items:center;height:90vh">` +
    `<div style="text-align:center"><h1 style="font-size:1.2rem">${title}</h1>` +
    `<p style="color:#666">${detail}</p></div>` +
    `<script>setTimeout(()=>window.close(),1500)</script></body>`

  // The way BACK from the authorization server. Registered before the
  // parameterized route below only for the reader — Fastify ranks the static
  // segment first regardless.
  app.get<{ Querystring: { state?: string; code?: string; error?: string } }>(
    '/api/mcp/signin/callback',
    async (request, reply) => {
      const { state, code, error } = request.query
      if (error) {
        return reply
          .type('text/html')
          .send(signinPage('Connexion refusée', String(error)))
      }
      if (typeof state !== 'string' || typeof code !== 'string') {
        return reply.code(400).type('text/html').send(signinPage('Réponse incomplète', ''))
      }
      const outcome = await mcpSignIn.complete(state, code)
      if ('problem' in outcome) {
        return reply.type('text/html').send(signinPage('Connexion échouée', outcome.problem))
      }
      return reply
        .type('text/html')
        .send(
          signinPage('Connecté', `${outcome.server} est maintenant relié à votre compte.`),
        )
    },
  )

  // Where the card and the tile send the person: a redirect into the
  // server's own authorization flow, state and PKCE held on this side.
  app.get<{ Params: { name: string } }>('/api/mcp/signin/:name', async (request, reply) => {
    const server = (await outboundServers()).find((entry) => entry.name === request.params.name)
    if (!server || server.signIn !== 'oauth') {
      return reply.code(404).send({ error: 'no such sign-in server' })
    }
    const begun = await mcpSignIn.begin(
      server,
      identityOf(request).userId,
      originOf(request),
      config.name ?? 'Adestia',
    )
    if ('problem' in begun) return reply.code(502).send({ error: begun.problem })
    return reply.redirect(begun.authorizeUrl)
  })

  /**
   * Adding and editing, which only the shell's own layer allows.
   *
   * The proposal is unmasked against what is stored and then judged by the
   * CONFIG's grammar — the same function the YAML goes through — so there is
   * no second, looser way into this instance's wiring.
   */
  const acceptServer = async (
    proposed: unknown,
    replacing: string | undefined,
    reply: FastifyReply,
  ): Promise<FastifyReply | { server: Record<string, unknown> }> => {
    if (proposed === null || typeof proposed !== 'object' || Array.isArray(proposed)) {
      return reply.code(400).send({ error: 'a server declaration is required' })
    }
    const stored = await mcpStore.list()
    const previous = replacing ? stored.find((server) => server.name === replacing) : undefined
    if (replacing && !previous) {
      return reply.code(404).send({ error: `no server named "${replacing}" was added here` })
    }

    const issues: string[] = []
    const filled = unmaskServer(proposed as Record<string, unknown>, previous, issues)
    const server = readMcpServer(filled, 'server', issues)
    if (!server || issues.length > 0) {
      return reply.code(400).send({ error: issues.join('; ') || 'that is not a server' })
    }

    // A name is where the agent's tools live. Two servers answering to one is
    // a tool call going somewhere nobody chose, so a collision is refused
    // here rather than resolved by precedence.
    const taken =
      config.mcpServers.some((other) => other.name === server.name) ||
      plugins.some(
        (plugin) =>
          plugin.active &&
          (plugin.manifest.mcpServers ?? []).some((other) => other.name === server.name),
      ) ||
      stored.some((other) => other.name === server.name && other.name !== replacing)
    if (taken) {
      return reply
        .code(409)
        .send({ error: `"${server.name}" is already declared on this instance` })
    }

    const kept = stored.filter((other) => other.name !== replacing)
    await mcpStore.save([...kept, server])
    return { server: maskServer(server) }
  }

  app.post<{ Body: unknown }>('/api/mcp/servers', async (request, reply) =>
    acceptServer(request.body, undefined, reply),
  )

  app.put<{ Params: { name: string }; Body: unknown }>(
    '/api/mcp/servers/:name',
    async (request, reply) => acceptServer(request.body, request.params.name, reply),
  )

  app.delete<{ Params: { name: string } }>('/api/mcp/servers/:name', async (request, reply) => {
    const stored = await mcpStore.list()
    if (!stored.some((server) => server.name === request.params.name)) {
      // 404 rather than a silent success: the only servers this route can
      // remove are the ones it wrote, and "gone" would read as "removed" for
      // a name that is actually still wired from the config.
      return reply.code(404).send({ error: `no server named "${request.params.name}" was added here` })
    }
    await mcpStore.save(stored.filter((server) => server.name !== request.params.name))
    return { removed: request.params.name }
  })
}
