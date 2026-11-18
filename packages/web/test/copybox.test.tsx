// @vitest-environment jsdom
/**
 * The copy box of a reply (B-copie-1, E-16, AD-copie-1): a ```copy fence of a
 * settled reply is a framed text with one copy button; everything else stays a <pre>.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { CopyBox } from '../src/chat/CopyBox.js'
import { Prose, Reader } from '../src/editor/Reader.js'

const FR: Record<string, string> = { Copy: 'Copier', Copied: 'Copié', 'Copy failed': 'Échec de la copie' }
const fr = (k: string) => FR[k] ?? k

function stubClipboard(writeText: (v: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}
const iconOf = (container: HTMLElement) => container.querySelector('button use')?.getAttribute('href') ?? ''

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'clipboard')
})

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

it('Prose: a copy block draws one button named Copy and writes the exact value', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  const { container } = render(<Prose markdown={'Voici :\n\n```copy\nBonjour Anne,\n\nJe confirme jeudi.\n```\n\nBien à vous'} />)
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(container.querySelector('.adestia-copybox')).not.toBeNull()
  expect(container.querySelector('pre')).toBeNull()
  await press('Copy')
  expect(writeText).toHaveBeenCalledTimes(1)
  expect(writeText).toHaveBeenCalledWith('Bonjour Anne,\n\nJe confirme jeudi.')
})

it('Prose: a longer fence keeps an inner ``` fence in the copied text', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  render(<Prose markdown={'````copy\navant\n```\ncode\n```\naprès\n````'} />)
  await press('Copy')
  expect(writeText).toHaveBeenCalledWith('avant\n```\ncode\n```\naprès')
})

it('Prose: a tilde fence is a copy box too', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  render(<Prose markdown={'~~~copy\nsalut\n~~~'} />)
  await press('Copy')
  expect(writeText).toHaveBeenCalledWith('salut')
})

it('Prose: another code block, and a code block without language, draw no button', () => {
  const { container } = render(<Prose markdown={'```sh\nls\n```\n\n```\nnu\n```\n\n```copying\nx\n```'} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(container.querySelectorAll('pre')).toHaveLength(3)
  expect(container.querySelector('.adestia-copybox')).toBeNull()
})

it('Reader: a copy block on a page stays a <pre>, with no button', () => {
  const { container } = render(<Reader markdown={'```copy\ntexte\n```'} path="a/b.md" />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(container.querySelector('pre')?.textContent).toBe('texte\n'.trimEnd())
  expect(container.querySelector('.adestia-copybox')).toBeNull()
})

it('Prose live: the box and its text are drawn, without any button', () => {
  const { container } = render(<Prose live markdown={'```copy\nà moitié écrit\n```'} />)
  expect(container.querySelector('.adestia-copybox')?.textContent).toBe('à moitié écrit')
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})

it('Prose: an empty copy block is an empty frame without button', () => {
  const { container } = render(<Prose markdown={'```copy\n```'} />)
  expect(container.querySelector('.adestia-copybox')).not.toBeNull()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})

it('Prose: a settled reply with an unclosed fence shows its text to the end, with the button', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  const { container } = render(<Prose markdown={'Voici\n\n```copy\nBonjour,\nla suite'} />)
  expect(container.querySelector('.adestia-copybox')?.textContent).toBe('Bonjour,\nla suite')
  await press('Copy')
  expect(writeText).toHaveBeenCalledWith('Bonjour,\nla suite')
})

it('Prose: two copy blocks each copy their own text only', async () => {
  const writeText = vi.fn(async () => {})
  stubClipboard(writeText)
  render(<Prose markdown={'```copy\npremier\n```\n\ntexte\n\n```copy\nsecond\n```'} />)
  const buttons = screen.getAllByRole('button', { name: 'Copy' })
  expect(buttons).toHaveLength(2)
  await act(async () => {
    fireEvent.click(buttons[1]!)
  })
  expect(writeText).toHaveBeenCalledTimes(1)
  expect(writeText).toHaveBeenCalledWith('second')
})

it('Prose: the text is drawn as text, never as HTML', () => {
  const { container } = render(<Prose markdown={'```copy\n<b>gras</b> & <script>x</script>\n```'} />)
  expect(container.querySelector('.adestia-copybox b')).toBeNull()
  expect(container.querySelector('.adestia-copybox script')).toBeNull()
  expect(container.querySelector('.adestia-copybox')?.textContent).toBe('<b>gras</b> & <script>x</script>')
})

it('Prose: the interface words come through t (French)', () => {
  render(<Prose markdown={'```copy\nx\n```'} t={fr} />)
  expect(screen.getByRole('button', { name: 'Copier' }).getAttribute('title')).toBe('Copier')
})

it('Prose: a copy block inside a list item or a quote is still a box', () => {
  const { container } = render(<Prose markdown={'- un\n\n  ```copy\n  dans la liste\n  ```\n\n> ```copy\n> cité\n> ```'} />)
  expect(container.querySelectorAll('.adestia-copybox').length).toBe(2)
  expect(screen.getAllByRole('button')).toHaveLength(2)
})

it('CopyBox: ready, copied then failed carry their icon and accessible name; the box announces politely', async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
  stubClipboard(writeText)
  const { container } = render(<CopyBox value="x" />)
  expect(container.querySelector('.adestia-copybox')?.getAttribute('aria-live')).toBe('polite')
  expect(iconOf(container)).toBe("#adestia-i-copy")
  expect(screen.getByRole('button', { name: 'Copy' }).getAttribute('title')).toBe('Copy')

  await press('Copy')
  expect(iconOf(container)).toBe("#adestia-i-check")
  expect(screen.getByRole('button', { name: 'Copied' }).getAttribute('title')).toBe('Copied')

  // a second press while "Copied" is still up, refused: failed
  await press('Copied')
  expect(iconOf(container)).toMatch(/#.*x$|x/)
  expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy()
})

it('CopyBox: copied goes back to ready after 2 s, not before', async () => {
  stubClipboard(async () => {})
  render(<CopyBox value="x" />)
  await press('Copy')
  await act(async () => {
    vi.advanceTimersByTime(1900)
  })
  expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeNull()
  await act(async () => {
    vi.advanceTimersByTime(200)
  })
  expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeNull()
})

it('CopyBox: a failed copy is raised by the next press, which can succeed', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
  stubClipboard(writeText)
  render(<CopyBox value="abc" />)
  await press('Copy')
  expect(screen.queryByRole('button', { name: 'Copy failed' })).not.toBeNull()
  await press('Copy failed')
  expect(writeText).toHaveBeenLastCalledWith('abc')
  expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeNull()
})

it('CopyBox: a failed copy goes back to ready by itself within 3 s', async () => {
  stubClipboard(async () => {
    throw new Error('denied')
  })
  render(<CopyBox value="x" />)
  await press('Copy')
  await act(async () => {
    vi.advanceTimersByTime(3100)
  })
  expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeNull()
})

it('CopyBox: no clipboard API falls back to execCommand with the exact text', async () => {
  Reflect.deleteProperty(navigator, 'clipboard')
  let seen = ''
  const exec = vi.fn((cmd: string) => {
    seen = (document.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? ''
    return cmd === 'copy'
  })
  Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
  render(<CopyBox value={'a\n\nb'} />)
  await press('Copy')
  expect(exec).toHaveBeenCalledWith('copy')
  expect(seen).toBe('a\n\nb')
  expect(document.querySelector('textarea')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeNull()
})

it('CopyBox: no clipboard API and execCommand refusing is a failed copy', async () => {
  Reflect.deleteProperty(navigator, 'clipboard')
  Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true })
  render(<CopyBox value="x" />)
  await press('Copy')
  expect(screen.queryByRole('button', { name: 'Copy failed' })).not.toBeNull()
})

it('CopyBox: live or empty draws no button', () => {
  const a = render(<CopyBox value="x" live />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  a.unmount()
  render(<CopyBox value="" />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})
