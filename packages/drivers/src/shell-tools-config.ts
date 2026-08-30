/**
 * How a `ShellToolsHandle` rides a PROCESS transport — shared by every driver
 * whose engine is (or may act as) a separate binary.
 *
 * The bridge is the server's file and carries no secret: the socket path and
 * the per-turn token travel in the child's env, which each engine rebuilds at
 * every spawn (measured for claude-code in spikes/shell-tools-transport;
 * true by construction for copilot, whose binary is spawned per turn).
 */

import type { ShellToolsHandle } from './contract.js'

/** One name across engines, so the agent's tool list reads the same. */
export const SHELL_TOOLS_SERVER_NAME = 'adestia'

export function bridgeStdioConfig(tools: ShellToolsHandle): {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
} {
  return {
    command: process.execPath,
    args: [tools.bridgePath],
    env: {
      ADESTIA_TOOLS_SOCKET: tools.socketPath,
      ADESTIA_TOOLS_TOKEN: tools.token,
    },
  }
}
