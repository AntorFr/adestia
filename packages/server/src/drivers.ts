/**
 * The engines this build can boot, and how each is built from the config.
 *
 * One switch, named loudly at the bottom: an instance asked for an engine
 * this build does not carry refuses to start rather than running another.
 */

import { join } from 'node:path'

import {
  AskDesk,
  ClaudeCodeDriver,
  CodexDriver,
  CopilotDriver,
  SHELL_TOOLS_SERVER_NAME,
  createOAuthFlow,
  type Driver,
  type ShellToolsHandle,
} from '@antorfr/adestia-drivers'

import { ConfigError, type AdestiaConfig } from './config.js'
import type { McpServer } from './extensions.js'
import { FileRefreshStore } from './mcp-refresh.js'
import { SecretStore } from './secrets.js'

export const AVAILABLE_DRIVERS = ['claude-code', 'copilot-cli', 'codex-cli'] as const

export async function buildDriver(
  config: AdestiaConfig,
  dataDir: string,
  mcpServers: () => readonly McpServer[],
  asks: AskDesk | undefined,
  log: (message: string) => void,
): Promise<Driver> {
  // Rotated MCP refresh tokens outlive the process here, beside the credential.
  // The log is threaded in because a write that fails costs nothing NOW — the
  // turn runs on the token in memory — and everything after the next restart.
  const refreshStore = new FileRefreshStore(dataDir, log)
  switch (config.driver.id) {
    case 'claude-code': {
      const sdk = await import('@anthropic-ai/claude-agent-sdk')
      // Undeclared in package.json the way the SDK itself is: both belong to
      // this branch alone, resolved from the SDK's own dependency tree.
      const { z } = await import('zod')
      // Loosened once, here: the SDK's `tool` wants a static zod shape, and
      // ours is built from the registry at runtime. The values ARE zod
      // schemas; only the generics cannot know it.
      const tool = sdk.tool as unknown as (
        name: string,
        description: string,
        schema: Record<string, unknown>,
        handler: (args: Record<string, unknown>) => Promise<unknown>,
      ) => never
      /**
       * Hosts a turn's shell tools inside THIS process: the handlers run
       * beside the conversation store, the turn's context travels by closure,
       * and no token exists on the path at all. Measured before relied on
       * (spikes/shell-tools-transport): the SDK accepts a live instance among
       * its `mcpServers`, and the handlers execute in the calling process.
       */
      const toolsHost = (handle: ShellToolsHandle): unknown =>
        sdk.createSdkMcpServer({
          name: SHELL_TOOLS_SERVER_NAME,
          tools: handle.tools.map((spec) =>
            tool(
              spec.name,
              spec.description,
              Object.fromEntries(
                spec.params.map((param) => [
                  param.name,
                  (param.optional ? z.string().optional() : z.string()).describe(
                    param.description,
                  ),
                ]),
              ),
              async (args) => {
                const outcome = await handle.call(spec.name, args)
                return {
                  content: [
                    { type: 'text' as const, text: outcome.ok ? outcome.text : outcome.error },
                  ],
                  ...(outcome.ok ? {} : { isError: true }),
                }
              },
            ),
          ),
        })
      return new ClaudeCodeDriver({
        query: sdk.query as unknown as ConstructorParameters<typeof ClaudeCodeDriver>[0]['query'],
        models: config.driver.models,
        // Arming speaks the OAuth flow itself rather than driving the CLI's
        // terminal screen: same authorization, but every failure comes back
        // as a status code instead of a half-drawn frame.
        armingFlow: createOAuthFlow(),
        ...(asks ? { asks } : {}),
        mcpServers,
        toolsHost,
        refreshStore,
      })
    }

    case 'copilot-cli':
      return new CopilotDriver({
        // Driver-owned: config, MCP servers, session store and its SQLite all
        // land here rather than in whatever HOME the process happens to have.
        home: join(dataDir, 'copilot-home'),
        models: config.driver.models,
        ...(config.driver.agent ? { agent: config.driver.agent } : {}),
        ...(config.driver.shellToolsTransport
          ? { shellToolsTransport: config.driver.shellToolsTransport }
          : {}),
        mcpServers,
        refreshStore,
        ...(config.driver.command ? { command: config.driver.command } : {}),
      })

    case 'codex-cli':
      return new CodexDriver({
        // Driver-owned: the credential, the sessions, the sqlite state. This
        // CLI honours it completely — spike 5 ran a dozen turns and left the
        // surrounding HOME empty.
        home: join(dataDir, 'codex-home'),
        models: config.driver.models,
        ...(asks ? { asks } : {}),
        mcpServers,
        refreshStore,
        ...(config.driver.command ? { command: config.driver.command } : {}),
        // The CLI may rotate a ChatGPT credential behind us; without this the
        // next restart would write the old document back over the fresh one
        // and the instance would lose its login for no visible reason.
        onCredentialRefreshed: (document) => {
          void new SecretStore(dataDir)
            .write('codex-cli', document)
            .then(() => log('driver credential refreshed by the CLI, re-stored'))
            .catch((error: Error) => log(`could not re-store the refreshed credential: ${error.message}`))
        },
      })

    default:
      // Named loudly rather than falling back to the default engine: silently
      // running a different CLI than the operator configured is indefensible.
      throw new ConfigError([
        `driver.id "${config.driver.id}" is not available in this build (have: ${AVAILABLE_DRIVERS.join(', ')})`,
      ])
  }
}
