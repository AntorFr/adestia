// @vitest-environment jsdom
/**
 * Chat components, rendered in jsdom.
 *
 * These are the pieces a user actually looks at, so what is asserted is what
 * they must be able to see: the bubble that grows, the trace that hides tool
 * inputs, the interruption that leaves a mark, the permission that blocks.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  Bubble,
  Chat,
  Composer,
  ContextPill,
  PermissionPrompt,
  ToolTrace,
  contextLevel,
  formatTokens,
} from '../src/chat/Chat.js'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('context pill', () => {
  it('scales its thresholds to the model window when one is known', () => {
    // Hardcoded 60k/120k lie on a model with a different window — the
    // predecessor's pill said "hot" at 40% of a 1M context.
    expect(contextLevel(50_000, 1_000_000)).toBe('calm')
    expect(contextLevel(400_000, 1_000_000)).toBe('warn')
    expect(contextLevel(800_000, 1_000_000)).toBe('hot')
  })

  it('falls back to absolute thresholds when no window is reported', () => {
    expect(contextLevel(10_000)).toBe('calm')
    expect(contextLevel(70_000)).toBe('warn')
    expect(contextLevel(130_000)).toBe('hot')
  })

  it('formats compactly', () => {
    expect(formatTokens(940)).toBe('940')
    expect(formatTokens(9_400)).toBe('9.4k')
    expect(formatTokens(94_000)).toBe('94k')
  })

  it('hides itself before there is anything to say', () => {
    const { container } = render(<ContextPill tokens={0} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('tool trace', () => {
  const tools = [
    { name: 'Read', target: '/workspace/notes.md', ok: true },
    { name: 'Bash', target: 'npm test', ok: false },
  ]

  it('stays collapsed until asked', () => {
    render(<ToolTrace tools={tools} />)
    expect(screen.queryByText('Read')).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Read')).toBeTruthy()
  })

  it('shows the target, never a full input', () => {
    render(<ToolTrace tools={tools} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('/workspace/notes.md')).toBeTruthy()
  })

  it('renders nothing when no tool ran', () => {
    const { container } = render(<ToolTrace tools={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('bubble', () => {
  it('marks an interrupted turn', () => {
    // The predecessor dropped this flag and interruptions vanished from the
    // thread, leaving a truncated answer that looked complete.
    render(<Bubble message={{ id: '1', role: 'agent', text: 'half', stopped: true }} />)
    expect(screen.getByText('Turn interrupted.')).toBeTruthy()
  })

  it('shows an error alongside whatever text arrived', () => {
    render(
      <Bubble message={{ id: '1', role: 'agent', text: 'partial', error: 'CLI died' }} />,
    )
    expect(screen.getByText('partial')).toBeTruthy()
    expect(screen.getByText('CLI died')).toBeTruthy()
  })
})

describe('composer', () => {
  it('sends on Enter and clears', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} blocked={false} />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(input, { target: { value: 'bonjour' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('bonjour')
    expect(input.value).toBe('')
  })

  it('keeps Shift+Enter for a new line', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} blocked={false} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'line' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('offers stop while a turn runs and the field is empty', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy blocked={false} />)
    expect(screen.getByLabelText('Stop')).toBeTruthy()
  })

  it('turns back into send as soon as the user types', () => {
    // Otherwise queueing a message means aiming at a stop button.
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy blocked={false} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'next' } })
    expect(screen.queryByLabelText('Stop')).toBeNull()
    expect(screen.getByLabelText('Send')).toBeTruthy()
  })

  it('refuses to send while a permission is pending', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} onStop={vi.fn()} busy blocked />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('permission prompt', () => {
  it('offers both answers and reports which was chosen', () => {
    const onDecide = vi.fn()
    render(
      <PermissionPrompt
        permission={{ id: 'p1', tool: 'Bash', detail: 'rm -rf build' }}
        onDecide={onDecide}
      />,
    )
    expect(screen.getByText('rm -rf build')).toBeTruthy()
    fireEvent.click(screen.getByText('Refuse'))
    expect(onDecide).toHaveBeenCalledWith('p1', false)
  })
})

/** A fetch that streams a scripted SSE body. */
function sseFetch(frames: readonly string[]): typeof fetch {
  return (() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          for (const frame of frames) controller.enqueue(encoder.encode(frame))
          controller.close()
        },
      }),
    } as unknown as Response)) as unknown as typeof fetch
}

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`

describe('chat', () => {
  it('shows the user message, then the streamed answer', async () => {
    const fetchImpl = sseFetch([
      frame({ type: 'text-delta', text: 'Bonjour ' }),
      frame({ type: 'text-delta', text: 'singe' }),
      frame({ type: 'result', sessionId: 's1', stopped: false, usage: { contextTokens: 4200 } }),
    ])
    render(<Chat fetchImpl={fetchImpl} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'salut' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(screen.getByText('salut')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Bonjour singe')).toBeTruthy())
    // The context pill appears once the turn reports what the next message costs.
    await waitFor(() => expect(screen.getByText('4.2k')).toBeTruthy())
  })
})

describe('mobile', () => {
  it('offers a way to the apps only when the shell is folded', () => {
    // Hiding the canvas with no route back was the predecessor's mobile in
    // miniature: the apps existed and no phone could open them.
    const { rerender } = render(<Chat fetchImpl={sseFetch([])} />)
    expect(screen.queryByLabelText('Open apps')).toBeNull()

    rerender(<Chat fetchImpl={sseFetch([])} onOpenCanvas={vi.fn()} />)
    expect(screen.getByLabelText('Open apps')).toBeTruthy()
  })

  it('switches screen when asked', () => {
    const onOpenCanvas = vi.fn()
    render(<Chat fetchImpl={sseFetch([])} onOpenCanvas={onOpenCanvas} />)
    fireEvent.click(screen.getByLabelText('Open apps'))
    expect(onOpenCanvas).toHaveBeenCalled()
  })
})
