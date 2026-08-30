// Question 1 + 2: per-turn freshness of a stdio MCP server's env, bridge
// round-trip, and behavior against a dead socket. Prints a JSON summary.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'

const HERE = dirname(fileURLToPath(import.meta.url))
// A short path: macOS caps unix socket paths at ~104 bytes.
const SOCK = join(mkdtempSync(join(tmpdir(), 'ads-')), 's.sock')
const WORKDIR = mkdtempSync(join(tmpdir(), 'ads-cwd-'))
const MODEL = 'claude-haiku-4-5-20251001'

const server = spawn(process.execPath, [join(HERE, 'socket-server.mjs'), SOCK], {
  stdio: ['ignore', 'inherit', 'inherit'],
})
for (let waited = 0; !existsSync(SOCK); waited += 50) {
  if (waited > 5000) throw new Error('socket server never listened')
  await new Promise((resolve) => setTimeout(resolve, 50))
}

async function turn(label, { resume, token, sock }) {
  const out = { label, token }
  try {
    const events = query({
      prompt:
        'Call the tool named "probe" from the MCP server "shell". Then answer with ONLY the exact JSON text the tool returned — no other words.',
      options: {
        cwd: WORKDIR,
        model: MODEL,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        ...(resume ? { resume } : {}),
        mcpServers: {
          shell: {
            type: 'stdio',
            command: process.execPath,
            args: [join(HERE, 'bridge.mjs')],
            env: { ADESTIA_SOCK: sock, SPIKE_TOKEN: token },
          },
        },
      },
    })
    for await (const message of events) {
      if (message.type === 'system' && message.subtype === 'init') {
        out.sessionId = message.session_id
        out.mcpStatus = message.mcp_servers
      }
      if (message.type === 'result') {
        out.sessionId ??= message.session_id
        out.answer = message.result ?? null
        out.isError = message.is_error ?? false
      }
    }
  } catch (error) {
    out.crashed = String(error)
  }
  console.log(`\n=== ${label} ===\n${JSON.stringify(out, null, 2)}`)
  return out
}

const one = await turn('turn-1 fresh session', { token: 'turn-1', sock: SOCK })
const two = await turn('turn-2 resumed session', {
  resume: one.sessionId,
  token: 'turn-2',
  sock: SOCK,
})
const dead = await turn('turn-3 dead socket', {
  token: 'turn-3',
  sock: join(tmpdir(), 'ads-nowhere.sock'),
})

server.kill()

const probe = (t) => {
  try {
    return JSON.parse((t.answer.match(/\{[^}]*\}/) ?? [])[0])
  } catch {
    return null
  }
}
const p1 = probe(one)
const p2 = probe(two)
console.log(
  `\n=== verdicts ===\n${JSON.stringify(
    {
      turn1Probe: p1,
      turn2Probe: p2,
      bridgeRespawnedPerTurn: !!(p1 && p2) && p1.bridgePid !== p2.bridgePid,
      envTokenFreshPerTurn: p1?.bridgeToken === 'turn-1' && p2?.bridgeToken === 'turn-2',
      deadSocket: { mcpStatus: dead.mcpStatus, isError: dead.isError, crashed: dead.crashed ?? null },
    },
    null,
    2,
  )}`,
)
