// @vitest-environment jsdom
/**
 * Chat components, rendered in jsdom.
 *
 * These are the pieces a user actually looks at, so what is asserted is what
 * they must be able to see: the bubble that grows, the trace that hides tool
 * inputs, the interruption that leaves a mark.
 */

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import {
  Bubble,
  AskPrompt,
  LiveProse,
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  Chat,
  Composer,
  ComposerFold,
  ContextPill,
  ModelPicker,
  ToolTrace,
  composerHeight,
  contextLevel,
  formatTokens,
} from '../src/chat/Chat.js'
import { PROSE_CADENCE_MS } from '../src/chat/useCadence.js'

describe('model picker', () => {
  it('draws nothing when the driver enumerates none', () => {
    // The whole point of the capability gate: an instance whose CLI has no
    // catalogue must not grow an empty control that does nothing.
    const { container } = render(<ModelPicker />)
    expect(container.firstChild).toBeNull()

    render(<ModelPicker models={[]} />)
    expect(screen.queryByLabelText('Model')).toBeNull()
  })

  it('offers Auto first, and labels each model as the instance named it', () => {
    render(
      <ModelPicker
        models={[{ id: 'claude-opus-5' }, { id: 'claude-sonnet-5', label: 'Sonnet 5' }]}
        model=""
        onModel={vi.fn()}
      />,
    )
    const options = [...(screen.getByLabelText('Model') as HTMLSelectElement).options]
    // Auto is a real answer — send no model, let the CLI decide — so it leads.
    expect(options.map((option) => option.value)).toEqual(['', 'claude-opus-5', 'claude-sonnet-5'])
    // A model with no label wears its id; one with a label wears the label.
    expect(options.map((option) => option.textContent)).toEqual(['Auto', 'claude-opus-5', 'Sonnet 5'])
  })

  it('reports a choice rather than keeping it', () => {
    const onModel = vi.fn()
    render(
      <ModelPicker models={[{ id: 'claude-sonnet-5', label: 'Sonnet 5' }]} model="" onModel={onModel} />,
    )
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude-sonnet-5' } })
    expect(onModel).toHaveBeenCalledWith('claude-sonnet-5')
  })

  it('keeps showing a chosen model the catalogue no longer offers', () => {
    // A driver that briefly fails to enumerate must not silently reset a
    // choice somebody made. The select falls back to Auto; the stored id is
    // not thrown away behind their back.
    render(
      <ModelPicker
        models={[{ id: 'claude-opus-5' }]}
        model="a-model-that-went-away"
        onModel={vi.fn()}
      />,
    )
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('')
  })
})

describe('the composer field', () => {
  it('stands at two lines when empty, and stops growing at the ceiling', () => {
    // The floor is the reported bug: a one-row slot on the surface whose
    // entire job is writing to somebody read as a search box.
    expect(composerHeight(20)).toBe(COMPOSER_MIN_HEIGHT)
    expect(composerHeight(COMPOSER_MIN_HEIGHT)).toBe(COMPOSER_MIN_HEIGHT)
    expect(composerHeight(96)).toBe(96)
    expect(composerHeight(4000)).toBe(COMPOSER_MAX_HEIGHT)
  })

  it('keeps the floor below the ceiling', () => {
    expect(COMPOSER_MIN_HEIGHT).toBeLessThan(COMPOSER_MAX_HEIGHT)
  })
})

describe('the composer fold', () => {
  const button = (id: string) => ({
    key: id,
    glyph: '◈',
    title: `Run ${id}`,
    api: {},
    onClick: vi.fn(),
  })

  it('lays the controls out in a row when there is room', () => {
    const scan = button('scan')
    render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
       
        folded={false}
        extraButtons={[scan]}
      />,
    )
    // Both reachable without opening anything, and no fold button at all.
    expect(screen.getByLabelText('Attach files')).toBeTruthy()
    expect(screen.getByLabelText('Run scan')).toBeTruthy()
    expect(screen.queryByLabelText('More')).toBeNull()
  })

  it('folds them under one button when the shell is narrow', () => {
    render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
       
        folded
        extraButtons={[button('scan')]}
      />,
    )
    // Nothing on screen but the fold: this is the width the field needs back.
    expect(screen.queryByLabelText('Attach files')).toBeNull()
    expect(screen.queryByLabelText('Run scan')).toBeNull()
    const more = screen.getByLabelText('More')
    expect(more.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    // Named in words, which the inline row of glyphs never did.
    expect(screen.getByRole('menuitem', { name: /Attach files/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Run scan/ })).toBeTruthy()
  })

  it('runs a plugin button and closes behind it', () => {
    const scan = button('scan')
    render(<ComposerFold onPick={vi.fn()} buttons={[scan]} />)
    fireEvent.click(screen.getByLabelText('More'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Run scan/ }))
    expect(scan.onClick).toHaveBeenCalledWith(scan.api)
    // A menu that stays open covers the field it belongs to.
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape and on a click outside', () => {
    render(<ComposerFold onPick={vi.fn()} buttons={[]} />)

    fireEvent.click(screen.getByLabelText('More'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByLabelText('More'))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('reaches the file picker the composer owns', () => {
    const onPick = vi.fn()
    render(<ComposerFold onPick={onPick} buttons={[]} />)
    fireEvent.click(screen.getByLabelText('More'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Attach files/ }))
    expect(onPick).toHaveBeenCalled()
  })
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

describe('markdown in a bubble', () => {
  it("renders the agent's formatting instead of printing it", () => {
    // The bug this closes: an answer arrived as its own source code, so a
    // reader saw the asterisks and the brackets rather than what they meant.
    const { container } = render(
      <Bubble
        message={{
          id: '1',
          role: 'agent',
          text: 'Voici du **gras**, de l\'`inline` et [un lien](https://example.org/x).',
        }}
      />,
    )

    expect(container.querySelector('strong')?.textContent).toBe('gras')
    expect(container.querySelector('code')?.textContent).toBe('inline')
    const link = container.querySelector('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://example.org/x')
    // Off-instance opens elsewhere rather than replacing the conversation.
    expect(link.getAttribute('target')).toBe('_blank')
    expect(container.textContent).not.toContain('**')
  })

  it('leaves what the user typed exactly as they typed it', () => {
    // A person typing into a field was never told a grammar applied, and has
    // no way to escape one. Their asterisks are asterisks.
    const { container } = render(
      <Bubble message={{ id: '1', role: 'user', text: 'pourquoi **ça** casse ?' }} />,
    )
    expect(container.querySelector('strong')).toBeNull()
    expect(screen.getByText('pourquoi **ça** casse ?')).toBeTruthy()
  })

  it('turns a workspace path the agent named into a page the shell opens', () => {
    const openPage = vi.fn()
    render(
      <Bubble
        message={{ id: '1', role: 'agent', text: 'Écrit dans [la fiche](voyages/baden.md).' }}
        openPage={openPage}
      />,
    )

    // A page opens IN PLACE, so it is a button and not an anchor — the chat
    // hands back the path and the shell decides where that lands.
    fireEvent.click(screen.getByText('la fiche'))
    expect(openPage).toHaveBeenCalledWith('voyages/baden.md')
  })

  it('redraws a growing answer on a cadence, and always shows its last delta', () => {
    // Not a nicety: markdown has to be re-parsed from the TOP on every delta,
    // because a `**` typed now decides what a `**` typed earlier meant. At a
    // few characters per delta that is quadratic — measured at 21 seconds of
    // CPU for one 20k-character answer. What is asserted here is the shape
    // that makes it linear in the DURATION of the turn instead: deltas
    // arriving inside one window are coalesced, and the trailing edge still
    // lands, because the last delta has nothing behind it to push it out.
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })

    const { rerender, container } = render(<LiveProse text="Le" />)
    expect(container.textContent).toBe('Le')

    rerender(<LiveProse text="Le **dé" />)
    rerender(<LiveProse text="Le **début**" />)
    // Still the first frame: three renders have cost exactly one parse.
    expect(container.textContent).toBe('Le')

    act(() => void vi.advanceTimersByTime(PROSE_CADENCE_MS))
    expect(container.querySelector('strong')?.textContent).toBe('début')

    // And nothing follows, which is the case a leading-edge throttle loses.
    rerender(<LiveProse text="Le **début** et la fin." />)
    act(() => void vi.advanceTimersByTime(PROSE_CADENCE_MS))
    expect(container.textContent).toContain('et la fin.')
  })

  it('keeps a single newline as a newline', () => {
    // CommonMark folds a soft break into a space, and for a FILE that is
    // right. Nobody hard-wraps a chat message, and the bubble had always
    // shown these breaks — folding them would be a regression paid for by
    // the fix. The predecessor rendered with `breaks: true` for this reason.
    const { container } = render(
      <Bubble message={{ id: '1', role: 'agent', text: 'Ligne un\nLigne deux' }} />,
    )
    expect(container.querySelectorAll('br')).toHaveLength(1)
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('keeps the words of a message that opens on a rule', () => {
    // `---` heading a source is frontmatter to the shared grammar, and the
    // page posture mines it for status chips. A chat message has none, so
    // that posture would render nothing at all and eat the first block.
    const { container } = render(
      <Bubble message={{ id: '1', role: 'agent', text: '---\nDeux options :\n---\nSuite.' }} />,
    )
    expect(container.textContent).toContain('Deux options :')
    expect(container.textContent).toContain('Suite.')
  })
})

describe('composer', () => {
  it('sends on Enter and clears', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} />)
    const input = screen.getByRole('textbox') as HTMLTextAreaElement

    fireEvent.change(input, { target: { value: 'bonjour' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Two arguments now: the text and whatever was attached with it.
    expect(onSend).toHaveBeenCalledWith('bonjour', [])
    expect(input.value).toBe('')
  })

  it('keeps Shift+Enter for a new line', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'line' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('leaves the model picker to the header', () => {
    // It moved out of the composer on purpose: the field is what this row is
    // for, and the picker was taking its width. A stray one here would mean
    // two of them on screen.
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />)
    expect(screen.queryByLabelText('Model')).toBeNull()
  })

  it('offers stop while a turn runs and the field is empty', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy />)
    expect(screen.getByLabelText('Stop')).toBeTruthy()
  })

  it('turns back into send as soon as the user types', () => {
    // Otherwise queueing a message means aiming at a stop button.
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'next' } })
    expect(screen.queryByLabelText('Stop')).toBeNull()
    expect(screen.getByLabelText('Send')).toBeTruthy()
  })

})

/**
 * A fetch that streams a scripted SSE body for a turn, and answers the
 * conversation routes the chat also calls.
 */
function sseFetch(
  frames: readonly string[],
  options: { models?: readonly { id: string; label?: string }[]; onTurn?: (body: unknown) => void } = {},
): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    if (String(url) === '/api/models') {
      return Promise.resolve(
        options.models
          ? ({ ok: true, status: 200, json: () => Promise.resolve({ models: options.models }) } as unknown as Response)
          : // What a driver without the capability actually answers.
            ({ ok: false, status: 404, json: () => Promise.resolve({}) } as unknown as Response),
      )
    }
    if (String(url).startsWith('/api/turn/attach')) {
      // Nothing running to adopt — the answer an idle desk gives, and what
      // keeps the follow-up attach after every turn from looping forever
      // against a fake that streams for any URL.
      return Promise.resolve({ ok: true, status: 204, body: null } as unknown as Response)
    }
    if (String(url).startsWith('/api/turn') && init?.body) {
      options.onTurn?.(JSON.parse(String(init.body)))
    }
    if (String(url).startsWith('/api/conversations')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            init?.method === 'POST'
              ? { id: 'c1', title: 'New conversation', updatedAt: '' }
              : { conversations: [] },
          ),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve({}),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          for (const frame of frames) controller.enqueue(encoder.encode(frame))
          controller.close()
        },
      }),
    } as unknown as Response)
  }) as unknown as typeof fetch
}

const frame = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`

describe('chat', () => {
  it('sends the chosen model, and nothing when it is Auto', async () => {
    // The two ends of the wire the review found unattached: the catalogue the
    // driver enumerates, and the field the turn carries.
    const bodies: unknown[] = []
    const fetchImpl = sseFetch([frame({ type: 'result', sessionId: 's1', stopped: false })], {
      models: [{ id: 'claude-opus-5' }, { id: 'claude-sonnet-5', label: 'Sonnet 5' }],
      onTurn: (body) => bodies.push(body),
    })
    render(<Chat fetchImpl={fetchImpl} />)

    const picker = await screen.findByLabelText('Model')
    const input = screen.getByRole('textbox')

    // Auto: the key is ABSENT, not empty. An empty string would override the
    // CLI's own default with nothing.
    fireEvent.change(input, { target: { value: 'un' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(bodies.length).toBe(1))
    expect('model' in (bodies[0] as Record<string, unknown>)).toBe(false)

    fireEvent.change(picker, { target: { value: 'claude-sonnet-5' } })
    fireEvent.change(input, { target: { value: 'deux' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(bodies.length).toBe(2))
    expect((bodies[1] as { model?: string }).model).toBe('claude-sonnet-5')
  })

  it('carries the screen the shell says is open, at send time', async () => {
    const bodies: unknown[] = []
    const fetchImpl = sseFetch([frame({ type: 'result', sessionId: 's1', stopped: false })], {
      onTurn: (body) => bodies.push(body),
    })
    const { rerender } = render(<Chat fetchImpl={fetchImpl} view={{ route: '/parcours', title: 'Parcours' }} />)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'et ça, c’est loin ?' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(bodies.length).toBe(1))
    expect((bodies[0] as { view?: unknown }).view).toEqual({ route: '/parcours', title: 'Parcours' })

    // Walking back to the landing canvas takes the note away with it: the
    // screen is read at send time, and nothing sticks from the turn before.
    rerender(<Chat fetchImpl={fetchImpl} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'et maintenant ?' } })
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    })
    await waitFor(() => expect(bodies.length).toBe(2))
    expect('view' in (bodies[1] as Record<string, unknown>)).toBe(false)
  })

  it('remembers the choice, and forgets it on Auto', async () => {
    // This environment has no localStorage at all — which is why the component
    // guards every access, and why the fake below is a fake rather than a
    // `clear()` on the real thing. A private window behaves the same way.
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })

    const models = [{ id: 'claude-sonnet-5', label: 'Sonnet 5' }]
    const view = render(<Chat fetchImpl={sseFetch([], { models })} />)

    fireEvent.change(await screen.findByLabelText('Model'), { target: { value: 'claude-sonnet-5' } })
    expect(store.get('adestia.model')).toBe('claude-sonnet-5')

    // Back after a reload: the choice is still the one that was made.
    view.unmount()
    render(<Chat fetchImpl={sseFetch([], { models })} />)
    const picker = await screen.findByLabelText('Model')
    expect((picker as HTMLSelectElement).value).toBe('claude-sonnet-5')

    // Auto CLEARS the key rather than storing an empty string: a stored '' and
    // no key mean the same thing, and only one of them survives a change of
    // default.
    fireEvent.change(picker, { target: { value: '' } })
    expect(store.has('adestia.model')).toBe(false)
  })

  it('draws no picker when the driver answers 404', async () => {
    const fetchImpl = sseFetch([frame({ type: 'result', sessionId: 's1', stopped: false })])
    render(<Chat fetchImpl={fetchImpl} />)
    await screen.findByRole('textbox')
    expect(screen.queryByLabelText('Model')).toBeNull()
  })

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

  it('shows the working indicator the moment the message leaves', async () => {
    // Between send and the driver's first event stand a conversation write,
    // the POST and a CLI spawn — seconds, sometimes. The server here never
    // answers AT ALL: the dots must come from the send itself, not from the
    // stream's first state.
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (String(url) === '/api/turn') return new Promise<Response>(() => {})
      return Promise.resolve(
        new Response(
          JSON.stringify(
            init?.method === 'POST' ? { id: 'c1', title: 'lent', updatedAt: '' } : { conversations: [] },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    }) as unknown as typeof fetch

    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'lent' } })
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    })
    expect(container.querySelector('.adestia-dots')).toBeTruthy()
  })

  it('keeps the indicator up between two answers, and files them as two messages', async () => {
    // Reported from the real interface: the agent answered, went back to its
    // tools for a while, then answered again. The indicator vanished at the
    // FIRST sentence — it was the alternative to the text, not its companion
    // — so a bubble that looked finished sat there while work went on. And
    // the second answer was glued to the bottom of the first.
    const encoder = new TextEncoder()
    let turn: ReadableStreamDefaultController<Uint8Array> | undefined

    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const path = String(url)
      if (path.startsWith('/api/turn/attach')) {
        return Promise.resolve({ ok: true, status: 204, body: null } as unknown as Response)
      }
      if (path === '/api/turn') {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            turn = controller
          },
        })
        return Promise.resolve({ ok: true, status: 200, body } as unknown as Response)
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(
            init?.method === 'POST' ? { id: 'c1', title: 'salut', updatedAt: '' } : { conversations: [] },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    }) as unknown as typeof fetch

    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'salut' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await act(async () => {
      turn!.enqueue(encoder.encode(frame({ type: 'text-delta', text: 'Je regarde.' })))
    })
    await waitFor(() => expect(screen.getByText('Je regarde.')).toBeTruthy())
    expect(container.querySelector('.adestia-dots')).toBeTruthy()

    await act(async () => {
      turn!.enqueue(encoder.encode(frame({ type: 'tool-use', name: 'Read', target: '/a.md' })))
      turn!.enqueue(encoder.encode(frame({ type: 'text-delta', text: 'Voilà.' })))
    })
    await waitFor(() => expect(screen.getByText('Voilà.')).toBeTruthy())
    expect(container.querySelectorAll('.adestia-bubble--agent')).toHaveLength(2)
    // Still working, and the trace hangs above the answer it produced.
    expect(container.querySelector('.adestia-dots')).toBeTruthy()
    expect(container.querySelectorAll('.adestia-trace')).toHaveLength(1)

    await act(async () => {
      turn!.enqueue(encoder.encode(frame({ type: 'result', sessionId: 's1', stopped: false })))
      turn!.close()
    })
    // Settled: the indicator goes, and what was drawn as two bubbles STAYS
    // two — the thread keeps the shape the live view had.
    await waitFor(() => expect(container.querySelector('.adestia-dots')).toBeNull())
    expect(container.querySelectorAll('.adestia-bubble--agent')).toHaveLength(2)
    expect(screen.getByText('Je regarde.')).toBeTruthy()
    expect(screen.getByText('Voilà.')).toBeTruthy()
  })

  it('POSTs a message sent during a turn at once, shows it held, then adopts the merged turn', async () => {
    // The queue is the SERVER's now: a message typed during a turn is posted
    // immediately (202 — held, already written into the thread), so a closed
    // tab loses nothing. When the running turn settles, the chat re-attaches
    // and picks up the merged follow-up the desk dispatched.
    const posts: { prompt: string }[] = []
    const encoder = new TextEncoder()
    let turn: ReadableStreamDefaultController<Uint8Array> | undefined
    let attach: ReadableStreamDefaultController<Uint8Array> | undefined
    let attachCalls = 0

    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const path = String(url)
      if (path.startsWith('/api/turn/attach')) {
        attachCalls += 1
        if (attachCalls === 1) {
          // The desk installed the merged turn before the first announced
          // its end, so the first re-attach finds it running.
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              attach = controller
            },
          })
          return Promise.resolve({ ok: true, status: 200, body } as unknown as Response)
        }
        return Promise.resolve({ ok: true, status: 204, body: null } as unknown as Response)
      }
      if (path === '/api/turn') {
        posts.push(JSON.parse(String(init?.body)) as { prompt: string })
        if (posts.length === 1) {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              turn = controller
            },
          })
          return Promise.resolve({ ok: true, status: 200, body } as unknown as Response)
        }
        // The conversation's turn is running: held, and already stored.
        return Promise.resolve({ ok: true, status: 202, body: null } as unknown as Response)
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(
            init?.method === 'POST' ? { id: 'c1', title: 'premier', updatedAt: '' } : { conversations: [] },
          ),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
    }) as unknown as typeof fetch

    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'premier' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(posts).toHaveLength(1))

    // Two more while the turn still streams: POSTed AT ONCE — the server is
    // what holds them — and shown waiting.
    fireEvent.change(input, { target: { value: 'deuxième' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    fireEvent.change(input, { target: { value: 'troisième' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    await waitFor(() => expect(posts).toHaveLength(3))
    expect(posts.map((p) => p.prompt)).toEqual(['premier', 'deuxième', 'troisième'])
    expect(container.querySelectorAll('.adestia-bubble--held')).toHaveLength(2)

    // The first turn settles; the chat re-attaches and finds the merged turn.
    await act(async () => {
      turn!.enqueue(encoder.encode(frame({ type: 'result', sessionId: 's1', stopped: false })))
      turn!.close()
    })
    await waitFor(() => expect(attachCalls).toBe(1))

    // The held bubbles became ordinary user messages — one each, the shape
    // the store recorded — and the merged turn streams its answer.
    await waitFor(() => expect(container.querySelectorAll('.adestia-bubble--held')).toHaveLength(0))
    expect(screen.getByText('deuxième')).toBeTruthy()
    expect(screen.getByText('troisième')).toBeTruthy()

    await act(async () => {
      attach!.enqueue(encoder.encode(frame({ type: 'text-delta', text: 'reçu cinq sur cinq' })))
      attach!.enqueue(encoder.encode(frame({ type: 'result', sessionId: 's1', stopped: false })))
      attach!.close()
    })
    await waitFor(() => expect(screen.getByText('reçu cinq sur cinq')).toBeTruthy())
  })

  it('adopts a running turn when a thread is opened', async () => {
    // The reload story: the turn kept running at the desk; opening the
    // thread replays the transcript from the store AND re-attaches to the
    // live turn, mid-flight.
    const encoder = new TextEncoder()
    const fetchImpl = vi.fn((url: string) => {
      const path = String(url)
      if (path.startsWith('/api/turn/attach')) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(frame({ type: 'text-delta', text: 'déjà en route' })))
            // Deliberately no close: the turn is still running.
          },
        })
        return Promise.resolve({ ok: true, status: 200, body } as unknown as Response)
      }
      if (path === '/api/conversations/c9') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'c9',
              title: 'En cours',
              updatedAt: '',
              sessionId: 's9',
              messages: [{ id: 'm1', role: 'user', text: 'longue mission', at: '' }],
            }),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ conversations: [{ id: 'c9', title: 'En cours', updatedAt: '' }] }),
      } as unknown as Response)
    }) as unknown as typeof fetch

    render(<Chat fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByLabelText('Conversations'))
    await act(async () => {
      fireEvent.click(await screen.findByText('En cours'))
    })

    // The stored half and the live half, together.
    expect(await screen.findByText('longue mission')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('déjà en route')).toBeTruthy())
  })
})

describe('tabs', () => {
  /** Serves two stored conversations, an idle desk, and a scripted turn. */
  const tabsFetch = (options: {
    metas?: readonly unknown[]
    onTurn?: (body: { prompt: string }) => Response | undefined
  } = {}) =>
    vi.fn((url: string, init?: RequestInit) => {
      const path = String(url)
      if (path.startsWith('/api/turn/attach')) {
        return Promise.resolve({ ok: true, status: 204, body: null } as unknown as Response)
      }
      if (path === '/api/turn') {
        const custom = options.onTurn?.(JSON.parse(String(init?.body)) as { prompt: string })
        if (custom) return Promise.resolve(custom)
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(frame({ type: 'result', sessionId: 's1', stopped: false })),
            )
            controller.close()
          },
        })
        return Promise.resolve({ ok: true, status: 200, body } as unknown as Response)
      }
      const conversation = /\/api\/conversations\/(c\d)$/.exec(path)?.[1]
      if (conversation) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: conversation,
              title: conversation === 'c1' ? 'Fil un' : 'Fil deux',
              updatedAt: '',
              messages: [
                { id: 'm1', role: 'user', text: `question ${conversation}`, at: '' },
                { id: 'm2', role: 'agent', text: `réponse ${conversation}`, at: '' },
              ],
            }),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            init?.method === 'POST'
              ? { id: 'c9', title: 'neuf', updatedAt: '' }
              : {
                  conversations:
                    options.metas ?? [
                      { id: 'c1', title: 'Fil un', updatedAt: '' },
                      { id: 'c2', title: 'Fil deux', updatedAt: '' },
                    ],
                },
          ),
      } as unknown as Response)
    }) as unknown as typeof fetch

  it('opens conversations as tabs and keeps their threads apart', async () => {
    render(<Chat fetchImpl={tabsFetch()} />)

    fireEvent.click(screen.getByLabelText('Conversations'))
    // findBy OUTSIDE act: its polling never observes renders from inside one.
    const filUn = await screen.findByText('Fil un')
    await act(async () => {
      fireEvent.click(filUn)
    })
    expect(await screen.findByText('réponse c1')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Conversations'))
    const filDeux = await screen.findByText('Fil deux')
    await act(async () => {
      fireEvent.click(filDeux)
    })
    expect(await screen.findByText('réponse c2')).toBeTruthy()
    // The other tab's thread is not painted over this one.
    expect(screen.queryByText('réponse c1')).toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    // Back by the strip: each tab holds its own transcript.
    await act(async () => {
      fireEvent.click(screen.getByTitle('Fil un'))
    })
    expect(screen.getByText('réponse c1')).toBeTruthy()
    expect(screen.queryByText('réponse c2')).toBeNull()
  })

  it('marks a background tab working, then unread, then read on return', async () => {
    let release: (() => void) | undefined
    const fetchImpl = tabsFetch({
      onTurn: () =>
        ({
          ok: true,
          status: 200,
          body: new ReadableStream<Uint8Array>({
            start(controller) {
              release = () => {
                controller.enqueue(
                  new TextEncoder().encode(
                    frame({ type: 'text-delta', text: 'fini' }),
                  ),
                )
                controller.enqueue(
                  new TextEncoder().encode(frame({ type: 'result', sessionId: 's1', stopped: false })),
                )
                controller.close()
              }
            },
          }),
        }) as unknown as Response,
    })
    const { container } = render(<Chat fetchImpl={fetchImpl} />)

    fireEvent.click(screen.getByLabelText('Conversations'))
    // findBy OUTSIDE act: its polling never observes renders from inside one.
    const filUn = await screen.findByText('Fil un')
    await act(async () => {
      fireEvent.click(filUn)
    })
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'travaille' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    // Elsewhere while the turn runs: the strip says the agent is working.
    await act(async () => {
      fireEvent.click(screen.getByLabelText('New conversation'))
    })
    await waitFor(() => expect(container.querySelector('.adestia-dot--working')).toBeTruthy())

    // It settles in the background: done, and not yet seen.
    await act(async () => {
      release?.()
    })
    await waitFor(() => expect(container.querySelector('.adestia-dot--unread')).toBeTruthy())

    // Coming back reads it: the dot goes quiet and the answer is there.
    await act(async () => {
      fireEvent.click(screen.getByTitle('Fil un'))
    })
    expect(container.querySelector('.adestia-dot--unread')).toBeNull()
    expect(screen.getByText('fini')).toBeTruthy()
  })

  it('closes a tab without losing the conversation from the list', async () => {
    render(<Chat fetchImpl={tabsFetch()} />)

    fireEvent.click(screen.getByLabelText('Conversations'))
    // findBy OUTSIDE act: its polling never observes renders from inside one.
    const filUn = await screen.findByText('Fil un')
    await act(async () => {
      fireEvent.click(filUn)
    })
    expect(screen.getAllByRole('tab')).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Close tab — Fil un'))
    })
    expect(screen.queryAllByRole('tab')).toHaveLength(0)

    // Closed is not archived: the thread still stands in the list.
    fireEvent.click(screen.getByLabelText('Conversations'))
    expect(await screen.findByText('Fil un')).toBeTruthy()
  })

  it('restores the open tabs of the last visit', async () => {
    // The browser-tab contract: a refresh reopens what was open, in order.
    const store = new Map<string, string>([
      ['adestia.tabs', JSON.stringify({ open: ['c2', 'c1'], active: 'c1' })],
    ])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
    onTestFinished(() => {
      vi.unstubAllGlobals()
    })

    render(<Chat fetchImpl={tabsFetch()} />)
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2))
    // In the persisted order, and the persisted active one shows its thread.
    const titles = screen.getAllByRole('tab').map((tab) => tab.textContent)
    expect(titles[0]).toContain('Fil deux')
    expect(titles[1]).toContain('Fil un')
    expect(await screen.findByText('réponse c1')).toBeTruthy()
  })

  it('dots the thread list from the desk state the server reports', async () => {
    const { container } = render(
      <Chat
        fetchImpl={tabsFetch({
          metas: [
            { id: 'c1', title: 'Occupé', updatedAt: '', turn: 'running' },
            { id: 'c2', title: 'Bloqué', updatedAt: '', turn: 'waiting' },
          ],
        })}
      />,
    )
    fireEvent.click(screen.getByLabelText('Conversations'))
    await screen.findByText('Occupé')
    expect(container.querySelector('.adestia-threads .adestia-dot--working')).toBeTruthy()
    expect(container.querySelector('.adestia-threads .adestia-dot--waiting')).toBeTruthy()
  })
})

describe('the compose channel', () => {
  // How a plugin puts text in the field WITHOUT sending it — the distinction
  // that makes a barcode reader a keyboard rather than a scanner that
  // commands.
  const capture = () => {
    const channel: { compose?: (text: string) => void } = {}
    render(
      <Chat
        fetchImpl={
          (() =>
            Promise.resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve({ conversations: [] }),
            } as unknown as Response)) as unknown as typeof fetch
        }
        onReady={(c) => {
          channel.compose = c.compose
        }}
      />,
    )
    return channel
  }

  it('fills the composer without sending', () => {
    const channel = capture()
    act(() => channel.compose?.('3017620422003'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('3017620422003')
    expect(screen.queryByText('3017620422003', { selector: '.adestia-bubble' })).toBeNull()
  })

  it('appends to what the user already typed, never replacing it', () => {
    // The sentence in the field IS the instruction; the codes are its object.
    const channel = capture()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ajoute aux courses' } })
    act(() => channel.compose?.('3017620422003'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'ajoute aux courses 3017620422003',
    )
  })

  it('composing nothing leaves the field exactly as it was', () => {
    const channel = capture()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'déjà tapé' } })
    act(() => channel.compose?.(''))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('déjà tapé')
  })
})

describe('attachments', () => {
  /** A fetch that accepts an upload and answers the rest blandly. */
  const withUpload = (result: unknown, ok = true): typeof fetch =>
    ((url: string) => {
      if (String(url) === '/api/upload') {
        return Promise.resolve({
          ok,
          status: ok ? 200 : 413,
          json: () => Promise.resolve(result),
        } as unknown as Response)
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ conversations: [] }),
        text: () => Promise.resolve(''),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          },
        }),
      } as unknown as Response)
    }) as unknown as typeof fetch

  const dropFile = (input: HTMLElement, name = 'plan.pdf') => {
    const file = new File(['x'], name, { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('shows an attached file before it is sent', async () => {
    const fetchImpl = withUpload({ attachments: [{ id: 'b/plan.pdf', name: 'plan.pdf' }] })
    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    dropFile(container.querySelector('input[type="file"]')!)
    await waitFor(() => expect(screen.getByText('plan.pdf')).toBeTruthy())
  })

  it('lets a file be removed before sending', async () => {
    const fetchImpl = withUpload({ attachments: [{ id: 'b/plan.pdf', name: 'plan.pdf' }] })
    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    dropFile(container.querySelector('input[type="file"]')!)
    fireEvent.click(await screen.findByLabelText('Remove plan.pdf'))
    expect(screen.queryByText('plan.pdf')).toBeNull()
  })

  it('says when a file was refused instead of dropping it silently', async () => {
    // A file silently dropped is a file the user believes the agent has.
    const fetchImpl = withUpload({ attachments: [], refused: ['plan.pdf is larger than 25 MB'] })
    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    dropFile(container.querySelector('input[type="file"]')!)
    await waitFor(() => expect(screen.getByText(/larger than 25 MB/)).toBeTruthy())
  })

  it('allows sending with no text at all', async () => {
    // Dropping a photo and saying nothing is a complete request.
    const fetchImpl = withUpload({ attachments: [{ id: 'b/photo.jpg', name: 'photo.jpg' }] })
    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    dropFile(container.querySelector('input[type="file"]')!, 'photo.jpg')
    await waitFor(() => expect(screen.getByLabelText('Send').closest('button')?.disabled).toBe(false))
  })

  it('takes a file let go on the composer', async () => {
    // Without a drop handler the browser leaves the conversation to display
    // the file — the worst possible answer to that gesture.
    const fetchImpl = withUpload({ attachments: [{ id: 'b/plan.pdf', name: 'plan.pdf' }] })
    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    const composer = container.querySelector('.adestia-composer')!

    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' })
    await act(async () => {
      fireEvent.drop(composer, { dataTransfer: { files: [file], types: ['Files'] } })
    })
    expect(await screen.findByText('plan.pdf')).toBeTruthy()
  })

  it('ignores text dragged inside the page', async () => {
    const fetchImpl = withUpload({ attachments: [{ id: 'b/x', name: 'x' }] })
    const { container } = render(<Chat fetchImpl={fetchImpl} />)
    const composer = container.querySelector('.adestia-composer')!

    fireEvent.dragOver(composer, { dataTransfer: { types: ['text/plain'] } })
    expect(composer.className).not.toMatch(/dropping/)
  })

  it('keeps Send disabled with neither text nor files', () => {
    render(<Chat fetchImpl={withUpload({})} />)
    expect(screen.getByLabelText('Send').closest('button')?.disabled).toBe(true)
  })
})

describe('threads', () => {
  /** A fetch that serves one stored thread with a rich transcript. */
  const withThread = (): typeof fetch =>
    ((url: string) => {
      const body =
        String(url) === '/api/conversations'
          ? { conversations: [{ id: 'c1', title: 'Le garage', updatedAt: '2026-01-01' }] }
          : {
              id: 'c1',
              title: 'Le garage',
              updatedAt: '2026-01-01',
              sessionId: 's9',
              messages: [
                { id: 'm1', role: 'user', text: 'range le garage', at: '' },
                {
                  id: 'm2',
                  role: 'agent',
                  text: 'half an answer',
                  at: '',
                  tools: [{ name: 'Read', target: '/plan.md', ok: true }],
                  stopped: true,
                  usage: { contextTokens: 4200 },
                },
              ],
            }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response)
    }) as unknown as typeof fetch

  it('lists the stored threads', async () => {
    render(<Chat fetchImpl={withThread()} />)
    fireEvent.click(screen.getByLabelText('Conversations'))
    await waitFor(() => expect(screen.getByText('Le garage')).toBeTruthy())
  })

  it('replays a thread faithfully — tools, interruption and context', async () => {
    // The predecessor replayed role and text only, so a truncated answer came
    // back looking complete. The stored transcript IS what the UI drew.
    render(<Chat fetchImpl={withThread()} />)
    fireEvent.click(screen.getByLabelText('Conversations'))
    fireEvent.click(await screen.findByText('Le garage'))

    await waitFor(() => expect(screen.getByText('half an answer')).toBeTruthy())
    expect(screen.getByText('range le garage')).toBeTruthy()
    expect(screen.getByText('Turn interrupted.')).toBeTruthy()
    expect(screen.getByText(/1 tool call/)).toBeTruthy()
    // The pill picks up where the thread left off.
    expect(screen.getByText('4.2k')).toBeTruthy()
  })

  it('starts a clean thread on demand', async () => {
    render(<Chat fetchImpl={withThread()} />)
    fireEvent.click(screen.getByLabelText('Conversations'))
    fireEvent.click(await screen.findByText('Le garage'))
    await waitFor(() => expect(screen.getByText('half an answer')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('New conversation'))
    expect(screen.queryByText('half an answer')).toBeNull()
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

describe("the engine's question", () => {
  const ASK = {
    id: 'q1',
    tool: 'Bash',
    title: 'Claude wants to run npm install --save-dev vitest @vitest/coverage-v8 --prefix ./packages/web',
    remembering: true,
  }

  it('shows the engine sentence whole, never elided', () => {
    // A predecessor rendered a target truncated to 78 characters — a string
    // built for a trace line, reused for consent. Consent to an elided
    // command is not consent.
    render(<AskPrompt ask={ASK} onAnswer={vi.fn()} />)
    expect(screen.getByText(ASK.title)).toBeTruthy()
  })

  it('offers the durable answer when the engine can remember one', () => {
    const onAnswer = vi.fn()
    render(<AskPrompt ask={ASK} onAnswer={onAnswer} />)
    fireEvent.click(screen.getByText('Always'))
    expect(onAnswer).toHaveBeenCalledWith('q1', 'always')
  })

  it('hides "always" when the engine gave no rule to remember', () => {
    // Hidden rather than inert: a button that promises silence and does not
    // deliver it is worse than one more question.
    render(<AskPrompt ask={{ ...ASK, remembering: false }} onAnswer={vi.fn()} />)
    expect(screen.queryByText('Always')).toBeNull()
    expect(screen.getByText('Just this once')).toBeTruthy()
  })

  it('stays gone while the turn keeps streaming', async () => {
    // The bug the first fix MISSED, reported from the real interface: the
    // prompt vanished on click and came straight back, over and over, until
    // the turn ended. Clearing it in the component is not enough — the
    // stream's generator carries its own accumulated state, still holding the
    // question, and re-yields it at the very next event.
    let answered = false
    let pushMore: (() => void) | undefined
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const path = String(url)
      if (path === '/api/permission') {
        answered = true
        return Promise.resolve(new Response('{}', { status: 200 }))
      }
      if (path === '/api/turn') {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: unknown) =>
              controller.enqueue(new TextEncoder().encode(frame(event)))
            send({
              type: 'permission-request',
              id: 'q1',
              tool: 'Bash',
              title: 'Bash — cd /workspace && cat >> notes.md',
              reason: 'Parser skipped input between top-level statements',
              remembering: false,
            })
            // Whatever the turn does next, once the answer has unblocked it.
            pushMore = () => {
              send({ type: 'tool-use', name: 'Bash', target: 'cd /workspace' })
              send({ type: 'text-delta', text: 'done' })
            }
          },
        })
        return Promise.resolve(new Response(body, { status: 200 }))
      }
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      )
    }) as unknown as typeof fetch

    render(<Chat fetchImpl={fetchImpl} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'go' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    const title = 'Bash — cd /workspace && cat >> notes.md'
    expect(await screen.findByText(title)).toBeTruthy()
    fireEvent.click(screen.getByText('Just this once'))
    await waitFor(() => expect(answered).toBe(true))
    await waitFor(() => expect(screen.queryByText(title)).toBeNull())

    // The turn resumes and streams on. The question must NOT come back.
    pushMore?.()
    await waitFor(() => expect(screen.getByText('done')).toBeTruthy())
    expect(screen.queryByText(title)).toBeNull()
  })

  it('disappears as soon as it is answered, not when the turn ends', async () => {
    // THE bug this rewrite exists to fix: the prompt used to stay on screen
    // until the turn's result arrived, so an answered question kept asking.
    //
    // The stream here never closes, exactly as a real one does not: the turn
    // is BLOCKED on this answer, so there is no next event until the server
    // has it. Optimistic clearing is the only correct timing.
    let answered: unknown
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      const path = String(url)
      if (path === '/api/permission') {
        answered = JSON.parse(String(init?.body))
        return new Promise<Response>(() => {})
      }
      if (path === '/api/turn') {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                frame({
                  type: 'permission-request',
                  id: 'q1',
                  tool: 'Bash',
                  title: 'Claude wants to run rm -rf build',
                  remembering: true,
                }),
              ),
            )
            // Deliberately no close(): the turn is waiting on the answer.
          },
        })
        return Promise.resolve(new Response(body, { status: 200 }))
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }) as unknown as typeof fetch

    render(<Chat fetchImpl={fetchImpl} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'go' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(await screen.findByText('Claude wants to run rm -rf build')).toBeTruthy()
    fireEvent.click(screen.getByText('Just this once'))

    await waitFor(() =>
      expect(screen.queryByText('Claude wants to run rm -rf build')).toBeNull(),
    )
    expect(answered).toEqual({ id: 'q1', answer: 'once' })
  })
})
