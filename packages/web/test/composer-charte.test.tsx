// @vitest-environment jsdom
/**
 * The composer on the charter: its buttons draw the shell's icons, never a
 * glyph; the send button is a stop while a turn runs and does nothing while a
 * question blocks the composer; the tray removes by a translated name and
 * shows an upload refusal in the shared error form.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { translator } from '../src/app/i18n.js'
import { Composer, ComposerFold } from '../src/chat/Composer.js'

afterEach(cleanup)

const FR: Record<string, string> = { 'Remove %name': 'Retirer %name', Stop: 'Arrêter', Send: 'Envoyer' }
const fr = (key: string) => FR[key] ?? key

const upload = (body: unknown, ok = true): typeof fetch =>
  (() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 413,
      json: () => Promise.resolve(body),
    } as unknown as Response)) as unknown as typeof fetch

const GLYPHS = /[＋📎■×↑]/u

describe('composer icons', () => {
  it('draws send, attach and the fold with svg icons and no glyph', () => {
    const { container, rerender } = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} folded={false} />)
    for (const label of ['Send', 'Attach files']) {
      const button = screen.getByLabelText(label)
      expect(button.querySelector('svg')).toBeTruthy()
      expect(button.textContent).toBe('')
    }
    expect(container.textContent).not.toMatch(GLYPHS)
    rerender(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} folded />)
    const more = screen.getByLabelText('More')
    expect(more.querySelector('svg')).toBeTruthy()
    expect(more.textContent).toBe('')
    fireEvent.click(more)
    expect(container.textContent).not.toMatch(GLYPHS)
    expect(screen.getByRole('menu').querySelector('svg')).toBeTruthy()
  })

  it('draws stop with an svg and gives every icon button a title', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy folded={false} />)
    const stop = screen.getByLabelText('Stop')
    expect(stop.querySelector('svg')).toBeTruthy()
    expect(stop.textContent).toBe('')
    expect(stop.getAttribute('title')).toBe('Stop')
    expect(screen.getByLabelText('Attach files').getAttribute('title')).toBe('Attach files')
  })

  it('keeps the livery send icon in the send slot instead of the shell arrow', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} sendIcon='<svg data-testid="plume"></svg>' />)
    const send = screen.getByLabelText('Send')
    expect(send.querySelector('[data-testid="plume"]')).toBeTruthy()
    expect(send.querySelectorAll('svg')).toHaveLength(1)
  })
})

describe('send / stop / blocked', () => {
  it('becomes Stop while a turn runs with an empty field, and Stop calls onStop', () => {
    const onStop = vi.fn()
    render(<Composer onSend={vi.fn()} onStop={onStop} busy />)
    expect(screen.queryByLabelText('Send')).toBeNull()
    fireEvent.click(screen.getByLabelText('Stop'))
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('spends the stop button once the stop was taken', () => {
    render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy stopping />)
    expect((screen.getByLabelText('Stop') as HTMLButtonElement).disabled).toBe(true)
  })

  it('leaves send inert and sends nothing while a question blocks the composer', () => {
    const onSend = vi.fn()
    const { container } = render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} blocked />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } })
    const send = screen.getByLabelText('Send') as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.click(send)
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends when not blocked, and the field is the only way to enable send', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} onStop={vi.fn()} busy={false} />)
    const send = screen.getByLabelText('Send') as HTMLButtonElement
    expect(send.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hi' } })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    expect(onSend).toHaveBeenCalledWith('hi', [])
  })

  it('marks stopping and blocked on the form so the stylesheet can draw them', () => {
    const { container } = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy stopping blocked />)
    const form = container.querySelector('form') as HTMLFormElement
    expect(form.className).toContain('adestia-composer--stopping')
    expect(form.className).toContain('adestia-composer--blocked')
  })

  it('carries no state class at rest', () => {
    const { container } = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />)
    expect((container.querySelector('form') as HTMLFormElement).className).toBe('adestia-composer')
  })
})

describe('attachment tray', () => {
  const withFile = async (t: (key: string) => string, name = 'plan.pdf') => {
    const view = render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
        folded={false}
        t={t}
        fetchImpl={upload({ attachments: [{ id: 'a1', name }] })}
      />,
    )
    const input = view.container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], name)] } })
    await waitFor(() => expect(screen.getByText(name)).toBeTruthy())
    return view
  }

  it('removes a file by a name-bearing label in English, with an icon', async () => {
    await withFile((key) => key)
    const remove = screen.getByLabelText('Remove plan.pdf')
    expect(remove.querySelector('svg')).toBeTruthy()
    expect(remove.textContent).not.toMatch(GLYPHS)
    fireEvent.click(remove)
    expect(screen.queryByText('plan.pdf')).toBeNull()
  })

  it('says Retirer in French and never the English word', async () => {
    await withFile(fr, 'devis.pdf')
    expect(screen.getByLabelText('Retirer devis.pdf')).toBeTruthy()
    expect(screen.queryByLabelText('Remove devis.pdf')).toBeNull()
  })

  it('removes only the file clicked', async () => {
    const view = render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
        folded={false}
        fetchImpl={upload({ attachments: [{ id: 'a', name: 'a.txt' }, { id: 'b', name: 'b.txt' }] })}
      />,
    )
    fireEvent.change(view.container.querySelector('input[type=file]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'a.txt')] },
    })
    await waitFor(() => expect(screen.getByText('b.txt')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Remove a.txt'))
    expect(screen.queryByText('a.txt')).toBeNull()
    expect(screen.getByText('b.txt')).toBeTruthy()
  })

  it('shows an upload refusal as an alert in the shared error form, with an icon', async () => {
    const view = render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
        folded={false}
        fetchImpl={upload({ error: 'File too large' }, false)}
      />,
    )
    fireEvent.change(view.container.querySelector('input[type=file]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'big.bin')] },
    })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('File too large')
    expect(alert.className).toContain('adestia-field__error')
    expect(alert.querySelector('svg')).toBeTruthy()
  })

  it('translates the HTTP fallback when the server sends no error, and keeps the server error first', async () => {
    const send = async (fetchImpl: typeof fetch, t?: (key: string) => string) => {
      const view = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} folded={false} fetchImpl={fetchImpl} {...(t ? { t } : {})} />)
      fireEvent.change(view.container.querySelector('input[type=file]') as HTMLInputElement, {
        target: { files: [new File(['x'], 'big.bin')] },
      })
      const alert = await screen.findByRole('alert')
      const text = alert.textContent
      view.unmount()
      return text
    }
    const FRR = (key: string) => (key === 'request failed (%n)' ? 'la requête a échoué (%n)' : key)
    const status503 = (() =>
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) } as unknown as Response)) as unknown as typeof fetch
    expect(await send(status503, FRR)).toBe('la requête a échoué (503)')
    expect(await send(upload({ error: 'Trop gros' }, false), FRR)).toBe('Trop gros')
    const down = (() => Promise.reject(new Error(''))) as unknown as typeof fetch
    expect(await send(down, FRR)).toBe('la requête a échoué (0)')
  })

  it('shows refused names next to what was accepted', async () => {
    const view = render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
        folded={false}
        fetchImpl={upload({ attachments: [{ id: 'a', name: 'ok.txt' }], refused: ['x.exe', 'y.exe'] })}
      />,
    )
    fireEvent.change(view.container.querySelector('input[type=file]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'ok.txt')] },
    })
    expect((await screen.findByRole('alert')).textContent).toBe('x.exe; y.exe')
    expect(screen.getByText('ok.txt')).toBeTruthy()
  })

  it('draws nothing when there is no file and no error', () => {
    const { container } = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} />)
    expect(container.querySelector('.adestia-attachments')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the fold keeps plugin buttons', () => {
  it('lists a plugin button inside the opened fold with its own title', () => {
    const onClick = vi.fn()
    render(
      <ComposerFold onPick={vi.fn()} buttons={[{ key: 'scan', glyph: '◈', title: 'Run scan', api: {}, onClick }]} />,
    )
    expect(screen.queryByText('Run scan')).toBeNull()
    fireEvent.click(screen.getByLabelText('More'))
    fireEvent.click(screen.getByText('Run scan'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('French wording', () => {
  it('translates the composer strings with the real dictionary', () => {
    const t = translator('fr')
    expect(t('Remove %name')).toBe('Retirer %name')
    expect(t('More')).toBe('Plus')
    expect(t('Stop')).toBe('Arrêter')
    expect(t('Send')).toBe('Envoyer')
    expect(t('Attach files')).toBe('Joindre des fichiers')
  })

  it('renders the tray remove label in French through the real dictionary', async () => {
    const view = render(
      <Composer
        onSend={vi.fn()}
        onStop={vi.fn()}
        busy={false}
        folded={false}
        t={translator('fr')}
        fetchImpl={upload({ attachments: [{ id: 'a', name: 'devis.pdf' }] })}
      />,
    )
    fireEvent.change(view.container.querySelector('input[type=file]') as HTMLInputElement, {
      target: { files: [new File(['x'], 'devis.pdf')] },
    })
    expect(await screen.findByLabelText('Retirer devis.pdf')).toBeTruthy()
  })
})

describe('field height on a narrow phone', () => {
  // jsdom has no layout, so scrollHeight is scripted: it answers with the
  // length of whatever the field holds at the moment it is read.
  const withScrollHeight = (height: (value: string) => number) =>
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLTextAreaElement) {
      return height(this.value)
    })

  it('measures an empty field on its placeholder and puts the empty value back', () => {
    // Panne : lire scrollHeight sur le champ vide (hauteur du rien) coupe le placeholder sur 2 lignes.
    const spy = withScrollHeight((value) => (value === 'Write to the assistant, at length' ? 90 : 20))
    try {
      const { container } = render(
        <Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} folded={false} placeholder="Write to the assistant, at length" />,
      )
      const field = container.querySelector('textarea') as HTMLTextAreaElement
      expect(field.value).toBe('')
      expect(field.style.height).toBe('90px')
    } finally {
      spy.mockRestore()
    }
  })

  it('measures typed text, not the placeholder, and caps the field at 200px with a scrollbar', () => {
    const spy = withScrollHeight((value) => (value === 'long' ? 500 : 20))
    try {
      const { container } = render(<Composer onSend={vi.fn()} onStop={vi.fn()} busy={false} folded={false} placeholder="ph" />)
      const field = container.querySelector('textarea') as HTMLTextAreaElement
      fireEvent.change(field, { target: { value: 'long' } })
      expect(field.style.height).toBe('200px')
      expect(field.style.overflowY).toBe('auto')
      fireEvent.change(field, { target: { value: '' } })
      expect(field.style.height).toBe('48px')
      expect(field.style.overflowY).toBe('hidden')
    } finally {
      spy.mockRestore()
    }
  })
})
