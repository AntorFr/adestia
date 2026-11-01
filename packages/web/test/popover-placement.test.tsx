// @vitest-environment jsdom
/**
 * Popover placement (docs/charte.md § 4, docs/ecrans.md E-5/E-6): the panel stays
 * below the canvas header and the bands above the page (E-19 problems, console,
 * read-only notice), follows its anchor on scroll/resize, and bounds its height.
 * jsdom has no layout: rectangles are scripted, expected pixels are written by hand.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Popover } from '../src/app/ui/index.js'

type Box = { top: number; bottom: number; left?: number; width?: number }
const rects = new Map<Element, Box>()
let frames: FrameRequestCallback[] = []
let panelHeight = 200

const rectOf = (el: Element): DOMRect => {
  const b = rects.get(el) ?? { top: 0, bottom: 0 }
  const left = b.left ?? 0
  const width = b.width ?? 300
  return { top: b.top, bottom: b.bottom, left, right: left + width, width, height: b.bottom - b.top, x: left, y: b.top, toJSON() {} } as DOMRect
}

beforeEach(() => {
  rects.clear()
  frames = []
  panelHeight = 200
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return rectOf(this) })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) { return this.classList.contains('adestia-popover') ? panelHeight : 0 },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.classList.contains('adestia-popover') ? 320 : 0 },
  })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames[id - 1] = () => {} })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
})

const flush = () => act(() => { const run = frames; frames = []; run.forEach((cb) => cb(0)) })

interface Page { anchor: HTMLElement; header: HTMLElement; problems: HTMLElement; chatAnchor: HTMLElement }
function mount(open = true): Page & { rerender: (open: boolean) => void } {
  const canvas = document.createElement('div')
  canvas.className = 'adestia-canvas'
  const header = Object.assign(document.createElement('header'), { className: 'adestia-canvas__header' })
  const problems = Object.assign(document.createElement('div'), { className: 'adestia-problems' })
  const anchor = document.createElement('button')
  canvas.append(header, problems, anchor)
  const chat = document.createElement('div')
  chat.className = 'adestia-chat'
  const chatAnchor = document.createElement('button')
  chat.append(chatAnchor)
  document.body.append(canvas, chat)
  rects.set(header, { top: 0, bottom: 60 })
  rects.set(problems, { top: 60, bottom: 140 })
  const ui = (o: boolean, which: HTMLElement) => <Popover anchor={{ current: which }} open={o} onClose={() => {}}>x</Popover>
  const view = render(ui(open, anchor))
  return { anchor, header, problems, chatAnchor, rerender: (o) => view.rerender(ui(o, anchor)) }
}
const panel = () => document.querySelector<HTMLElement>('.adestia-popover')!
const top = () => Number.parseFloat(panel().style.top)

describe('Popover under the canvas chrome', () => {
  it('opens below the tallest band, not at the anchor', () => {
    const p = mount(false)
    rects.set(p.anchor, { top: 70, bottom: 90, left: 100 })
    p.rerender(true)
    // below the anchor would be 98, inside the problems band (bottom 140): 140 + 8
    expect(top()).toBe(148)
    expect(panel().style.left).toBe('100px')
  })

  it('never rises above the header when the anchor scrolls under it, and follows it back', () => {
    const p = mount(false)
    p.problems.remove()
    rects.set(p.anchor, { top: 300, bottom: 320, left: 100 })
    p.rerender(true)
    expect(top()).toBe(328)
    rects.set(p.anchor, { top: -100, bottom: -80, left: 100 })
    act(() => { document.dispatchEvent(new Event('scroll')) })
    flush()
    expect(top()).toBe(68) // header bottom 60 + 8, not -72
    rects.set(p.anchor, { top: 400, bottom: 420, left: 100 })
    act(() => { document.dispatchEvent(new Event('scroll')) })
    flush()
    expect(top()).toBe(428)
  })

  it('flips above the anchor when the bottom lacks room, but not over a band', () => {
    const p = mount(false)
    rects.set(p.anchor, { top: 800, bottom: 820 })
    p.rerender(true)
    expect(top()).toBe(592) // 800 - 8 - 200
    rects.set(p.anchor, { top: 200, bottom: 220 })
    panelHeight = 900
    act(() => { window.dispatchEvent(new Event('resize')) })
    flush()
    // too tall for either side: pinned under the band, height cut to what remains
    expect(top()).toBe(148)
    expect(panel().style.maxHeight).toBe('744px') // 900 - 8 - 148
  })

  it('shrinks and regrows with the window height', () => {
    const p = mount(false)
    rects.set(p.anchor, { top: 200, bottom: 220 })
    p.rerender(true)
    expect(panel().style.maxHeight).toBe('200px')
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })
    act(() => { window.dispatchEvent(new Event('resize')) })
    flush()
    expect(panel().style.maxHeight).toBe('144px') // 300 - 8 - 148
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    act(() => { window.dispatchEvent(new Event('resize')) })
    flush()
    expect(panel().style.maxHeight).toBe('200px')
  })

  it('ignores chrome that is hidden, and the canvas bands for a chat anchor', () => {
    const p = mount(false)
    rects.set(p.problems, { top: 0, bottom: 0 })
    rects.set(p.anchor, { top: 5, bottom: 25 })
    p.rerender(true)
    expect(top()).toBe(68)
    cleanup()
    document.body.innerHTML = ''
    const q = mount(false)
    rects.set(q.chatAnchor, { top: 5, bottom: 25 })
    render(<Popover anchor={{ current: q.chatAnchor }} open onClose={() => {}}>y</Popover>)
    expect(Number.parseFloat(document.querySelectorAll<HTMLElement>('.adestia-popover')[0]!.style.top)).toBe(33)
  })

  it('keeps inside the right edge', () => {
    const p = mount(false)
    rects.set(p.anchor, { top: 200, bottom: 220, left: 1400 })
    p.rerender(true)
    expect(panel().style.left).toBe('1112px') // 1440 - 8 - 320
  })

  it('stops listening once closed: no placement after close, none pending', () => {
    const p = mount(false)
    rects.set(p.anchor, { top: 300, bottom: 320 })
    p.rerender(true)
    const removed = vi.spyOn(document, 'removeEventListener')
    p.rerender(false)
    expect(removed.mock.calls.some(([t]) => t === 'scroll')).toBe(true)
    expect(panel()).toBeNull()
    act(() => { document.dispatchEvent(new Event('scroll')) })
    expect(frames.length).toBe(0)
  })

  it('does not re-place for a scroll inside the panel itself', () => {
    const p = mount(false)
    rects.set(p.anchor, { top: 300, bottom: 320 })
    p.rerender(true)
    act(() => { panel().dispatchEvent(new Event('scroll')) })
    expect(frames.length).toBe(0)
  })
})
