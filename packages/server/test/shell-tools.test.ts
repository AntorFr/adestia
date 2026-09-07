import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConversationStore } from '../src/conversations.js'
import { ShellToolsService, ulid } from '../src/shell-tools.js'

let root: string
let store: ConversationStore
let service: ShellToolsService

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-tools-'))
  store = new ConversationStore(root)
  service = new ShellToolsService({ dataDir: root, conversations: store })
})

afterEach(async () => {
  await service.close()
})

const CTX = (conversationId: string) => ({ userId: 'chloe', conversationId })

describe('ulid', () => {
  it('mints 26 Crockford characters, sortable by creation time', () => {
    const earlier = ulid(1_000_000)
    const later = ulid(2_000_000)
    expect(earlier).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(later > earlier).toBe(true)
  })

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 1000 }, () => ulid()))
    expect(seen.size).toBe(1000)
  })
})

describe('dispatch — the one path both transports end in', () => {
  it('renames the turn conversation without ever being told which', async () => {
    const meta = await store.create('chloe', 'First 48 characters of whatever I typed…')
    const outcome = await service.dispatch(CTX(meta.id), 'rename_conversation', {
      title: 'Chauffe-eau du garage',
    })
    expect(outcome).toEqual({ ok: true, text: 'Conversation renamed to "Chauffe-eau du garage".' })
    expect((await store.read('chloe', meta.id))?.title).toBe('Chauffe-eau du garage')
  })

  it('flattens control characters and whitespace before judging the title', async () => {
    const meta = await store.create('chloe')
    const outcome = await service.dispatch(CTX(meta.id), 'rename_conversation', {
      title: '  Plan \u0000du\n\n garage\t ',
    })
    expect(outcome.ok).toBe(true)
    expect((await store.read('chloe', meta.id))?.title).toBe('Plan du garage')
  })

  it('refuses an empty title, a runaway title, and a missing conversation', async () => {
    const meta = await store.create('chloe')
    expect(
      await service.dispatch(CTX(meta.id), 'rename_conversation', { title: ' \n ' }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('empty') })
    expect(
      await service.dispatch(CTX(meta.id), 'rename_conversation', { title: 'x'.repeat(200) }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('120') })
    expect(
      await service.dispatch(CTX('gone'), 'rename_conversation', { title: 'Titre' }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('no longer exists') })
  })

  it('refuses what the registry does not declare', async () => {
    expect(await service.dispatch(CTX('c'), 'drop_everything', {})).toMatchObject({ ok: false })
    expect(await service.dispatch(CTX('c'), 'rename_conversation', {})).toMatchObject({
      ok: false,
      error: expect.stringContaining('required'),
    })
    expect(
      await service.dispatch(CTX('c'), 'rename_conversation', { title: 42 }),
    ).toMatchObject({ ok: false, error: expect.stringContaining('string') })
  })

  it('mints ids with no conversation involved at all', async () => {
    const outcome = await service.dispatch(CTX('whatever'), 'new_id', {})
    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.text).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})

describe('the handle — implicit target, per-turn token', () => {
  it('closes over the turn context so call() needs no ids', async () => {
    const meta = await store.create('chloe')
    const handle = service.handleFor(CTX(meta.id))
    const outcome = await handle.call('rename_conversation', { title: 'Par la closure' })
    expect(outcome.ok).toBe(true)
    expect((await store.read('chloe', meta.id))?.title).toBe('Par la closure')
  })

  it('compacts a renamed thread when its turn settles — and only then', async () => {
    const meta = await store.create('chloe')
    const handle = service.handleFor(CTX(meta.id))
    await handle.call('rename_conversation', { title: 'Un' })
    await handle.call('rename_conversation', { title: 'Deux' })

    const file = join(root, 'conversations')
    const dir = (await import('node:fs/promises')).readdir
    const [userDir] = await dir(file)
    const lines = async () =>
      (await readFile(join(file, userDir!, `${meta.id}.jsonl`), 'utf8'))
        .split('\n')
        .filter((line) => line.trim() !== '')

    // Three meta lines while the turn runs: create + two renames.
    expect((await lines()).length).toBe(3)
    await service.release(handle)
    // One line after settle: the compaction the store always promised.
    expect((await lines()).length).toBe(1)
    expect((await store.read('chloe', meta.id))?.title).toBe('Deux')
  })

  it('does not compact a thread the turn never renamed', async () => {
    const meta = await store.create('chloe')
    await store.rename('chloe', meta.id, 'Renommé par la route PATCH')
    const handle = service.handleFor(CTX(meta.id))
    await service.release(handle)
    const [userDir] = await (await import('node:fs/promises')).readdir(join(root, 'conversations'))
    const raw = await readFile(join(root, 'conversations', userDir!, `${meta.id}.jsonl`), 'utf8')
    expect(raw.split('\n').filter((line) => line.trim() !== '').length).toBe(2)
  })
})

/** A tiny MCP client over the unix socket — what the bridge pipes for real. */
function client(socketPath: string) {
  const conn = connect(socketPath)
  let buffer = ''
  const waiters: ((line: string) => void)[] = []
  conn.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      waiters.shift()?.(line)
    }
  })
  return {
    hello(token: string | undefined) {
      conn.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'bridge/hello', params: { token } })}\n`)
    },
    request(id: number, method: string, params?: unknown): Promise<Record<string, unknown>> {
      const answer = new Promise<Record<string, unknown>>((resolve) => {
        waiters.push((line) => resolve(JSON.parse(line) as Record<string, unknown>))
      })
      conn.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      return answer
    },
    end: () => conn.end(),
  }
}

describe('the socket — what an external-binary engine reaches through the bridge', () => {
  it('serves initialize, tools/list and an authorized tools/call', async () => {
    await service.start()
    const meta = await store.create('chloe')
    const handle = service.handleFor(CTX(meta.id))

    const mcp = client(service.socketPath)
    mcp.hello(handle.token)
    const init = await mcp.request(1, 'initialize', { protocolVersion: '2025-01-01' })
    expect(init['result']).toMatchObject({ protocolVersion: '2025-01-01' })

    const list = (await mcp.request(2, 'tools/list')) as {
      result: { tools: { name: string; inputSchema: { required: string[] } }[] }
    }
    expect(list.result.tools.map((tool) => tool.name).sort()).toEqual([
      'find_pages',
      'new_id',
      'rename_conversation',
    ])
    expect(
      list.result.tools.find((tool) => tool.name === 'rename_conversation')?.inputSchema.required,
    ).toEqual(['title'])
    // Every parameter optional is not an oversight: asking a locator for
    // nothing in particular is a legitimate first question, and the cap in the
    // answer is what keeps it from becoming a corpus dump.
    expect(list.result.tools.find((tool) => tool.name === 'find_pages')?.inputSchema.required).toEqual(
      [],
    )

    const call = (await mcp.request(3, 'tools/call', {
      name: 'rename_conversation',
      arguments: { title: 'Depuis la prise' },
    })) as { result: { content: { text: string }[]; isError?: boolean } }
    expect(call.result.isError).toBeUndefined()
    expect((await store.read('chloe', meta.id))?.title).toBe('Depuis la prise')
    mcp.end()
  })

  it('answers an unknown or released token with words for the agent, not a hang', async () => {
    await service.start()
    const meta = await store.create('chloe')
    const handle = service.handleFor(CTX(meta.id))
    await service.release(handle)

    const mcp = client(service.socketPath)
    mcp.hello(handle.token)
    const call = (await mcp.request(1, 'tools/call', {
      name: 'rename_conversation',
      arguments: { title: 'Trop tard' },
    })) as { result: { isError?: boolean; content: { text: string }[] } }
    expect(call.result.isError).toBe(true)
    expect(call.result.content[0]?.text).toContain('token')
    expect((await store.read('chloe', meta.id))?.title).not.toBe('Trop tard')
    mcp.end()
  })

  it('expires a token the TTL outlived — the safety net behind release', async () => {
    const brief = new ShellToolsService({
      dataDir: root,
      conversations: store,
      tokenTtlMs: 1,
    })
    await brief.start()
    const meta = await store.create('chloe')
    const handle = brief.handleFor(CTX(meta.id))
    await new Promise((resolve) => setTimeout(resolve, 10))

    const mcp = client(brief.socketPath)
    mcp.hello(handle.token)
    const call = (await mcp.request(1, 'tools/call', {
      name: 'new_id',
      arguments: {},
    })) as { result: { isError?: boolean } }
    expect(call.result.isError).toBe(true)
    mcp.end()
    await brief.close()
  })

  it('writes the secret-free bridge beside the data it serves', async () => {
    await service.start()
    const bridge = await readFile(service.bridgePath, 'utf8')
    expect(bridge).toContain('ADESTIA_TOOLS_SOCKET')
    expect(bridge).toContain('bridge/hello')
    // No secret in the file: the token travels in the child's env.
    expect(bridge).not.toContain('Bearer')
    await stat(service.socketPath)
  })

  it('falls back to a short socket path when the data dir would overflow the cap', () => {
    const deep = join(root, 'x'.repeat(120))
    const cramped = new ShellToolsService({ dataDir: deep, conversations: store })
    expect(Buffer.byteLength(cramped.socketPath)).toBeLessThanOrEqual(104)
    expect(cramped.socketPath).not.toContain(deep)
  })
})
