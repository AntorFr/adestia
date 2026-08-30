// Question 3: createSdkMcpServer — do handlers run inside this process, and
// does one instance passed to two query() calls keep state across turns?
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk'

const WORKDIR = mkdtempSync(join(tmpdir(), 'ads-cwd-'))
const MODEL = 'claude-haiku-4-5-20251001'

let calls = 0
const shell = createSdkMcpServer({
  name: 'shell',
  tools: [
    tool('probe', 'Report the host process that ran this tool.', {}, async () => ({
      content: [
        { type: 'text', text: JSON.stringify({ hostPid: process.pid, callNumber: ++calls }) },
      ],
    })),
  ],
})

async function turn(label, resume) {
  const out = { label }
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
        mcpServers: { shell },
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

const one = await turn('turn-1 fresh session')
const two = await turn('turn-2 resumed session', one.sessionId)

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
      ranInThisProcess: p1?.hostPid === process.pid && p2?.hostPid === process.pid,
      instanceStateSharedAcrossTurns: p1?.callNumber === 1 && p2?.callNumber === 2,
    },
    null,
    2,
  )}`,
)
