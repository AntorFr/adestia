// A localhost OpenAI-compatible endpoint, no dependencies.
//
// Why it exists: if `codex` can be pointed at it, the whole driver path —
// JSONL events, sessions, tool calls, usage — becomes testable in CI with no
// OpenAI account and no network. Same method as spike 3's Copilot BYOK mock.
//
// Serves both wire APIs codex knows:
//   POST /v1/chat/completions   (wire_api = "chat")
//   POST /v1/responses          (wire_api = "responses")
// Every request body is appended to requests.jsonl for later inspection.
//
// Usage: node mock-provider.js [--port 45188] [--log requests.jsonl]
//                              [--script simple|toolcall]

import { createServer } from 'node:http'
import { appendFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const port = Number(opt('port', '45188'))
const logPath = opt('log', 'requests.jsonl')
const script = opt('script', 'simple')

const sse = (res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  return {
    send: (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`),
    done: () => {
      res.write('data: [DONE]\n\n')
      res.end()
    },
  }
}

/** How many turns we have already answered — the tool-call script needs two. */
let turn = 0

function chatCompletions(body, res) {
  const s = sse(res)
  const id = `chatcmpl-mock-${Date.now()}`
  const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: body.model }
  const chunk = (delta, finish = null) =>
    s.send({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })

  const wantsTool = script === 'toolcall' && turn === 0
  turn += 1

  if (wantsTool) {
    // The shell tool as codex declares it in the chat wire api. Its exact name
    // is read back from the request, so this works whatever codex calls it.
    const shell = (body.tools ?? []).find((t) => /shell|exec|bash/i.test(t?.function?.name ?? ''))
    const name = shell?.function?.name ?? 'shell'
    const argv = JSON.stringify({ command: ['/bin/echo', 'mock-tool-ran'], workdir: null, timeout_ms: 5000 })
    chunk({ role: 'assistant', content: '' })
    chunk({ tool_calls: [{ index: 0, id: 'call_mock_1', type: 'function', function: { name, arguments: '' } }] })
    chunk({ tool_calls: [{ index: 0, function: { arguments: argv } }] })
    chunk({}, 'tool_calls')
  } else {
    chunk({ role: 'assistant', content: '' })
    for (const piece of ['hello', ' from', ' the', ' mock']) chunk({ content: piece })
    chunk({}, 'stop')
  }
  s.send({ ...base, choices: [], usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } })
  s.done()
}

function responses(body, res) {
  const s = sse(res)
  const id = `resp-mock-${Date.now()}`
  const itemId = 'msg_mock_1'

  // First turn of the tool script: ask for a shell command instead of talking.
  if ((script === 'toolcall' || script === 'escalate' || script === 'write') && turn++ === 0) {
    const tool = (body.tools ?? []).find((t) => /exec_command|shell|bash/.test(t?.name ?? ''))
    const name = tool?.name ?? 'exec_command'
    const argv =
      script === 'escalate'
        ? { cmd: 'echo escalated-command-ran', sandbox_permissions: 'require_escalated', justification: 'The spike wants to see the approval event.' }
        : script === 'write'
          ? { cmd: 'echo written > mock-wrote-this.txt' }
          : { cmd: 'echo mock-tool-ran' }
    const call = {
      id: 'fc_mock_1',
      type: 'function_call',
      name,
      arguments: JSON.stringify(argv),
      call_id: 'call_mock_1',
    }
    s.send({ type: 'response.created', response: { id, model: body.model } })
    s.send({ type: 'response.output_item.done', output_index: 0, item: call })
    s.send({
      type: 'response.completed',
      response: { id, model: body.model, output: [call], usage: { input_tokens: 21, output_tokens: 9, total_tokens: 30, input_tokens_details: { cached_tokens: 0 } } },
    })
    return s.done()
  }

  s.send({ type: 'response.created', response: { id, model: body.model } })
  s.send({ type: 'response.output_item.added', output_index: 0, item: { id: itemId, type: 'message', role: 'assistant', content: [] } })
  for (const piece of ['hello', ' from', ' the', ' mock']) {
    s.send({ type: 'response.output_text.delta', item_id: itemId, output_index: 0, content_index: 0, delta: piece })
  }
  s.send({
    type: 'response.output_item.done',
    output_index: 0,
    item: { id: itemId, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello from the mock' }] },
  })
  s.send({
    type: 'response.completed',
    response: {
      id,
      model: body.model,
      output: [{ id: itemId, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hello from the mock' }] }],
      usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18, input_tokens_details: { cached_tokens: 0 } },
    },
  })
  s.done()
}

createServer((req, res) => {
  let raw = ''
  req.on('data', (d) => (raw += d))
  req.on('end', () => {
    let body = {}
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      /* keep the raw line anyway */
    }
    appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), method: req.method, url: req.url, headers: req.headers, body })}\n`)
    if (req.url?.includes('/chat/completions')) return chatCompletions(body, res)
    if (req.url?.includes('/responses')) return responses(body, res)
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{"error":"no such mock route"}')
  })
}).listen(port, '127.0.0.1', () => {
  console.error(`mock provider on http://127.0.0.1:${port} (script=${script}, log=${logPath})`)
})
