import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { ConversationStore, isSafeId, userDirectory } from '../src/conversations.js'

let root: string
let store: ConversationStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'adestia-conv-'))
  store = new ConversationStore(root)
})

const message = (text: string, extra: Record<string, unknown> = {}) => ({
  id: `m-${text}`,
  role: 'agent' as const,
  text,
  at: new Date().toISOString(),
  ...extra,
})

describe('user directories', () => {
  it('hashes the user id instead of sanitizing it', () => {
    // OIDC subjects carry slashes and colons. A "sanitize" that maps two
    // different users onto one directory is a data leak, not a formatting
    // choice.
    const a = userDirectory('https://id.example/users/1')
    const b = userDirectory('https://id.example/users/2')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is stable for the same user', () => {
    expect(userDirectory('chloe')).toBe(userDirectory('chloe'))
  })
})

describe('id safety', () => {
  it('accepts what we generate and refuses what we do not', () => {
    expect(isSafeId(crypto.randomUUID())).toBe(true)
    expect(isSafeId('../../etc/passwd')).toBe(false)
    expect(isSafeId('a/b')).toBe(false)
    expect(isSafeId('')).toBe(false)
  })

  it('refuses to append under an unsafe id', async () => {
    await expect(store.append('u', '../escape', message('x'))).rejects.toThrow(/unsafe/)
  })
})

describe('threads', () => {
  it('round-trips a conversation', async () => {
    const { id } = await store.create('chloe', 'Le garage')
    await store.append('chloe', id, { id: 'm1', role: 'user', text: 'salut', at: '2026-01-01T00:00:00Z' })
    await store.append('chloe', id, message('bonjour'))

    const conversation = await store.read('chloe', id)
    expect(conversation?.title).toBe('Le garage')
    expect(conversation?.messages.map((m) => m.text)).toEqual(['salut', 'bonjour'])
  })

  it('keeps everything the UI drew, not just the text', async () => {
    // The predecessor stored role and text, so a reload lost the tool trace
    // and every interruption marker: a truncated answer came back looking
    // complete.
    const { id } = await store.create('chloe')
    await store.append(
      'chloe',
      id,
      message('half an answer', {
        tools: [{ name: 'Read', target: '/a.md', ok: true }],
        stopped: true,
        usage: { contextTokens: 4200 },
      }),
    )

    const [stored] = (await store.read('chloe', id))!.messages
    expect(stored).toMatchObject({
      tools: [{ name: 'Read', target: '/a.md', ok: true }],
      stopped: true,
      usage: { contextTokens: 4200 },
    })
  })

  it('files a signature card on the message whose tools asked for it', async () => {
    // A reload must draw the card where the live view did — and a part that
    // only asked for a signature, with nothing said yet, is still a message.
    const { id } = await store.create('chloe')
    const signature = { id: 'c1', kind: 'consent' as const, url: 'https://tessera.example/consent/c1' }
    await store.recordOutcome('chloe', id, {
      parts: [
        { tools: [], text: 'Je tente.' },
        { tools: [], text: '', signatures: [signature] },
      ],
      stopped: false,
    })
    const messages = (await store.read('chloe', id))!.messages
    expect(messages.map((m) => m.signatures)).toEqual([undefined, [signature]])
  })

  it('reads a message posted during a turn after that turn’s answer', async () => {
    // Filed on arrival, the follow-up lands in the file before the answer it
    // waited behind. Read back, it must come after that answer's LAST part —
    // and read the same once compacted, and stay put while its turn has filed
    // nothing (still running, or lost).
    const { id } = await store.create('chloe')
    const user = (text: string, extra: Record<string, unknown> = {}) =>
      message(text, { role: 'user', ...extra })
    await store.append('chloe', id, user('q1'))
    await store.append('chloe', id, user('q2', { after: 't1' }))
    await store.append('chloe', id, user('q3', { after: 't1' }))
    const texts = async () => (await store.read('chloe', id))!.messages.map((m) => m.text)
    expect(await texts()).toEqual(['q1', 'q2', 'q3'])

    await store.recordOutcome('chloe', id, {
      turn: 't1',
      parts: [
        { tools: [], text: 'a1' },
        { tools: [{ name: 'Read' }], text: 'a1 bis' },
      ],
      stopped: false,
    })
    await store.append('chloe', id, user('q4', { after: 't2' }))
    await store.recordOutcome('chloe', id, { turn: 't2', parts: [{ tools: [], text: 'a2' }], stopped: false })
    await store.append('chloe', id, user('q5', { after: 'lost' }))

    const said = ['q1', 'a1', 'a1 bis', 'q2', 'q3', 'a2', 'q4', 'q5']
    expect(await texts()).toEqual(said)
    await store.compact('chloe', id)
    expect(await texts()).toEqual(said)
  })

  it('remembers which CLI session a thread resumes', async () => {
    const { id } = await store.create('chloe')
    await store.setSession('chloe', id, 'sess-9')
    expect((await store.read('chloe', id))?.sessionId).toBe('sess-9')
  })

  it('survives a half-written last line', async () => {
    // What a crash mid-append looks like. Losing that line beats refusing to
    // open the thread.
    const { id } = await store.create('chloe')
    await store.append('chloe', id, message('intact'))
    const path = join(root, 'conversations', userDirectory('chloe'), `${id}.jsonl`)
    await writeFile(path, `${await readFile(path, 'utf8')}{"type":"message","text":"trunc`)

    const conversation = await store.read('chloe', id)
    expect(conversation?.messages.map((m) => m.text)).toEqual(['intact'])
  })

  it('returns nothing for a conversation that does not exist', async () => {
    expect(await store.read('chloe', crypto.randomUUID())).toBeUndefined()
  })
})

describe('isolation between users', () => {
  it('does not let one user read another thread', async () => {
    // The workspace is shared; conversations are not.
    const { id } = await store.create('chloe')
    await store.append('chloe', id, message('private'))
    expect(await store.read('marc', id)).toBeUndefined()
    expect(await store.list('marc')).toEqual([])
  })
})

describe('listing', () => {
  it('is empty for a user with no threads', async () => {
    expect(await store.list('nobody')).toEqual([])
  })

  it('puts the most recently active first', async () => {
    const older = await store.create('chloe', 'Older')
    await store.append('chloe', older.id, message('a', { at: '2026-01-01T00:00:00Z' }))
    const newer = await store.create('chloe', 'Newer')
    await store.append('chloe', newer.id, message('b', { at: '2026-06-01T00:00:00Z' }))

    expect((await store.list('chloe')).map((c) => c.title)).toEqual(['Newer', 'Older'])
  })

  it('carries no message bodies', async () => {
    // A thread list that loads every transcript is a list that gets slower
    // with every conversation ever held.
    const { id } = await store.create('chloe')
    await store.append('chloe', id, message('body'))
    expect(await store.list('chloe')).toEqual([expect.not.objectContaining({ messages: expect.anything() })])
  })
})

describe('rename and delete', () => {
  it('renames without losing the messages', async () => {
    const { id } = await store.create('chloe', 'Untitled')
    await store.append('chloe', id, message('kept'))
    await store.rename('chloe', id, 'Le garage')

    const conversation = await store.read('chloe', id)
    expect(conversation?.title).toBe('Le garage')
    expect(conversation?.messages.map((m) => m.text)).toEqual(['kept'])
  })

  it('deletes', async () => {
    const { id } = await store.create('chloe')
    expect(await store.remove('chloe', id)).toBe(true)
    expect(await store.read('chloe', id)).toBeUndefined()
  })

  it('reports a delete that matched nothing', async () => {
    expect(await store.remove('chloe', crypto.randomUUID())).toBe(false)
  })
})

describe('compaction', () => {
  it('collapses a rewritten history without changing what it says', async () => {
    // Append-only logs grow forever: a thread renamed six times replays six
    // meta lines on every open.
    const { id } = await store.create('chloe', 'One')
    await store.append('chloe', id, message('kept'))
    for (const title of ['Two', 'Three', 'Four']) await store.rename('chloe', id, title)

    const before = await store.size('chloe', id)
    const stateBefore = await store.read('chloe', id)
    await store.compact('chloe', id)

    expect(await store.size('chloe', id)).toBeLessThan(before)
    const after = await store.read('chloe', id)
    expect(after?.title).toBe(stateBefore?.title)
    expect(after?.messages).toEqual(stateBefore?.messages)
  })

  it('leaves no temporary file behind', async () => {
    const { id } = await store.create('chloe')
    await store.compact('chloe', id)
    expect((await store.list('chloe')).map((c) => c.id)).toEqual([id])
  })
})

describe('archiving', () => {
  it('hides a thread from the list and keeps every word', async () => {
    // The only tool for tidying up was a delete that took the whole record
    // with it. A thread nobody needs today is not one nobody will want back.
    const store = new ConversationStore(await mkdtemp(join(tmpdir(), 'adestia-conv-')))
    const meta = await store.create('sebastien', 'Rails Festool')
    await store.append('sebastien', meta.id, {
      id: 'm1',
      role: 'user',
      text: 'les rails plus tard',
      at: new Date().toISOString(),
    })

    await store.archive('sebastien', meta.id)
    expect(await store.list('sebastien')).toEqual([])

    // Kept, and readable: archiving is not a delete wearing a softer word.
    const read = await store.read('sebastien', meta.id)
    expect(read?.archived).toBe(true)
    expect(read?.messages.map((m) => m.text)).toEqual(['les rails plus tard'])
    expect((await store.list('sebastien', true)).map((c) => c.id)).toEqual([meta.id])
  })

  it('brings one back', async () => {
    // Reversible by construction, so putting a thread away is never a
    // decision somebody has to regret.
    const store = new ConversationStore(await mkdtemp(join(tmpdir(), 'adestia-conv-')))
    const meta = await store.create('sebastien', 'Corse')
    await store.archive('sebastien', meta.id)
    await store.archive('sebastien', meta.id, false)
    expect((await store.list('sebastien')).map((c) => c.id)).toEqual([meta.id])
  })

  it('leaves other people’s threads alone', async () => {
    const store = new ConversationStore(await mkdtemp(join(tmpdir(), 'adestia-conv-')))
    const mine = await store.create('sebastien', 'À moi')
    const hers = await store.create('emilie', 'À elle')
    await store.archive('sebastien', mine.id)
    expect((await store.list('emilie')).map((c) => c.id)).toEqual([hers.id])
  })
})
