/**
 * A signature request read out of a tool result, in all three engines.
 *
 * The fixtures are Tessera's own sentences, copied from its gateway
 * (`guard/internal/gateway/gateway.go` and `request.go`): the detection is a
 * contract with those words, and a fixture that paraphrased them would pass
 * the day Tessera rephrased and the cards silently stopped.
 */

import { describe, expect, it } from 'vitest'

import { ClaudeCodeDriver } from '../src/claude-code/driver.js'
import type { QueryFn, SdkMessage } from '../src/claude-code/sdk-types.js'
import { newTranslationState as codexState, translate as codex } from '../src/codex-cli/events.js'
import type { TurnEvent } from '../src/contract.js'
import { newTranslationState as copilotState, translate as copilot } from '../src/copilot-cli/events.js'
import { signatureRequest, signatureRequests } from '../src/signatures.js'

const CONSENT =
  'CONSENT PENDING — this call requires a human signature.\n' +
  'consent_id: c_7f3a (expires 2026-09-30T08:10:00Z)\n' +
  'A human has been asked to approve: "Send an email to Paul"\n' +
  'Sign at: https://tessera.berard.me/consent/c_7f3a — hand this link to the human who approves.\n' +
  'Poll by calling this same tool again with arguments {"_consent": "c_7f3a"}. ' +
  'Do not resend the original arguments; they are held server-side.'

const REPOLL =
  'CONSENT PENDING — not signed yet. Poll again with {"_consent": "c_7f3a"}. ' +
  'Sign at: https://tessera.berard.me/consent/c_7f3a'

const GRANT =
  'REQUEST OPENED — nothing is approved yet.\ngrant_id: g_91\n' +
  'A human must read and sign it here: https://tessera.berard.me/consent/g_91\n' +
  'Unsigned, the request lapses at 2026-10-01T06:00:00Z.\n' +
  'Once signed, make the covered call with _meta {"grant/id": "g_91"}. ' +
  'Until then that call still suspends and asks for a signature, so there is no need to poll this.'

describe('signatureRequest', () => {
  it('reads an immediate consent, its link and its expiry', () => {
    expect(signatureRequest(CONSENT)).toEqual({
      type: 'signature-request',
      id: 'c_7f3a',
      kind: 'consent',
      url: 'https://tessera.berard.me/consent/c_7f3a',
      expiresAt: '2026-09-30T08:10:00Z',
    })
  })

  it('reads the re-poll, which carries the link but no expiry', () => {
    expect(signatureRequest(REPOLL)).toEqual({
      type: 'signature-request',
      id: 'c_7f3a',
      kind: 'consent',
      url: 'https://tessera.berard.me/consent/c_7f3a',
    })
  })

  it('reads a grant asked ahead of time, with when it lapses', () => {
    expect(signatureRequest(GRANT)).toEqual({
      type: 'signature-request',
      id: 'g_91',
      kind: 'grant',
      url: 'https://tessera.berard.me/consent/g_91',
      expiresAt: '2026-10-01T06:00:00Z',
    })
  })

  it('ignores a ceremony link without the words around it', () => {
    // A page the agent fetched may quote a link; only Tessera's sentence
    // makes it a request.
    expect(signatureRequest('see https://tessera.berard.me/consent/abc')).toBeUndefined()
    expect(signatureRequest('CONSENT PENDING — but no link here')).toBeUndefined()
  })

  it('walks any envelope and reports one request per ceremony', () => {
    const result = { content: [{ type: 'text', text: CONSENT }, { type: 'text', text: REPOLL }] }
    expect(signatureRequests(result).map((r) => r.id)).toEqual(['c_7f3a'])
  })
})

describe('in each engine', () => {
  it('claude-code reads an MCP tool result, and only an MCP one', async () => {
    const script: SdkMessage[] = [
      {
        type: 'assistant',
        session_id: 's',
        message: {
          content: [
            { type: 'tool_use', id: 't1', name: 'mcp__google__send_mail', input: {} },
            { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/x' } },
          ],
        },
      },
      {
        type: 'user',
        session_id: 's',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: CONSENT }] },
            // A file that quotes Tessera is not a ceremony.
            { type: 'tool_result', tool_use_id: 't2', content: GRANT },
          ],
        },
      },
      { type: 'result', subtype: 'success', session_id: 's', result: '' } as SdkMessage,
    ]
    const query: QueryFn = () => ({
      async *[Symbol.asyncIterator]() {
        for (const message of script) yield message
      },
      interrupt: () => Promise.resolve(undefined),
    })
    const events: TurnEvent[] = []
    for await (const event of new ClaudeCodeDriver({ query }).runTurn({ prompt: 'go', cwd: '.' })) events.push(event)
    const asked = events.filter((event) => event.type === 'signature-request')
    expect(asked).toEqual([expect.objectContaining({ id: 'c_7f3a', kind: 'consent' })])
    // Right after the result it came from, so the card hangs on that part.
    const at = events.findIndex((event) => event.type === 'signature-request')
    expect(events[at - 1]).toMatchObject({ type: 'tool-result', id: 't1' })
  })

  it('codex reads an mcpToolCall result', () => {
    const events = [
      ...codex(
        {
          method: 'item/completed',
          params: {
            item: {
              type: 'mcpToolCall',
              id: 'm1',
              server: 'google',
              tool: 'request_grant',
              status: 'completed',
              result: { content: [{ type: 'text', text: GRANT }] },
            },
          },
        } as never,
        codexState('t'),
      ),
    ]
    expect(events[0]).toMatchObject({ type: 'tool-result', name: 'request_grant' })
    expect(events[1]).toMatchObject({ type: 'signature-request', id: 'g_91', kind: 'grant' })
  })

  it('codex does not read a shell command that printed the words', () => {
    const events = [
      ...codex(
        {
          method: 'item/completed',
          params: { item: { type: 'commandExecution', id: 'c1', status: 'completed', aggregatedOutput: CONSENT } },
        } as never,
        codexState('t'),
      ),
    ]
    expect(events.some((event) => event.type === 'signature-request')).toBe(false)
  })

  it('copilot reads a completed tool', () => {
    const state = copilotState()
    copilot({ type: 'tool.execution_start', data: { toolCallId: '1', toolName: 'send_mail' } } as never, state)
    const events = copilot(
      {
        type: 'tool.execution_complete',
        data: { toolCallId: '1', success: true, result: { content: CONSENT } },
      } as never,
      state,
    )
    expect(events[1]).toMatchObject({ type: 'signature-request', id: 'c_7f3a', kind: 'consent' })
  })
})
