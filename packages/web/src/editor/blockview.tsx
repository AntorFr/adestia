/**
 * How a `:::` block looks WHILE it is being written: the way it reads.
 *
 * The editor used to draw every block as the same grey box with an accent
 * rail, its body raw — figures as bullets, a list as the word `:::list`, a
 * planning as lines of dates — so a page changed shape the moment somebody
 * pressed Edit, and a card, a title or a band could only be judged after
 * saving. Each block is now a node view wearing the reader's own classes:
 *
 * - PROSE blocks (`content`, `callout`, `gallery`, `table`) keep their body
 *   editable in place, inside the same card, under the same header, in the
 *   same aside, as the reader draws them.
 * - DATA blocks (a list, figures, a planning, whatever a plugin declares with
 *   a body) show what the READER draws — the real rendering, from the same
 *   component — and switch to their raw lines on a click, since lines are
 *   what they are written in.
 * - ATOMS (a block with no body — a checklist, `:::row`) show the rendering
 *   and nothing to type in.
 *
 * Every block carries a small bar with its name and ⚙, which opens its
 * settings (`BlockSettings`): the attributes it declares and the reserved
 * ones — title, icon, card, width. The layout the reader gives `w=` bands is
 * given here too, by CSS on the editor surface (`editor.css`).
 */

import { resolveBlock, type Indexed } from '@antorfr/adestia-content'
import { serializerCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { createRoot, type Root } from 'react-dom/client'

import { BlockSettings } from './BlockSettings.js'
import { prettify } from './nodes.js'
import { Reader, type BlockComponents, type VocabularyContext } from './Reader.js'

/** What a block's rendering needs to know about the page it is written in. */
export interface EditorEnv {
  readonly path?: string | undefined
  readonly store?: string | undefined
  readonly fields?: Readonly<Record<string, unknown>> | undefined
  readonly blocks?: BlockComponents | undefined
  readonly vocabulary?: VocabularyContext | undefined
  readonly pages?: readonly Indexed[] | undefined
  readonly fetchImpl?: typeof fetch | undefined
  readonly locale?: string | undefined
}

type Posture = 'prose' | 'data' | 'atom'

/** Blocks whose body is text a person writes in place. */
const PROSE = new Set(['content', 'callout', 'gallery', 'table'])

/**
 * The next block view to be built opens its settings — set by the `/` menu
 * right before it inserts one, so a new block asks for what it needs (a
 * section's `type`, a title) instead of appearing bare.
 */
let settingsForNext = false
export function openSettingsOnNextBlock(): void {
  settingsForNext = true
}

export function directiveView(name: string, atom: boolean, env: EditorEnv) {
  return (ctx: Ctx) =>
    (node: ProseNode, view: EditorView, getPos: () => number | undefined): NodeView =>
      new DirectiveView(name, atom ? 'atom' : PROSE.has(name) ? 'prose' : 'data', node, view, getPos, ctx, env)
}

type Attributes = Record<string, string>

class DirectiveView implements NodeView {
  readonly dom: HTMLElement
  readonly contentDOM?: HTMLElement
  private node: ProseNode
  private readonly bar: HTMLElement
  private readonly toggle?: HTMLButtonElement
  private readonly panel: HTMLElement
  private panelRoot?: Root
  private readonly preview?: HTMLElement
  private previewRoot?: Root
  private readonly head?: HTMLElement
  private readonly lift: HTMLButtonElement
  /** A data block showing its raw lines rather than its rendering. */
  private raw = false
  private open: boolean

  constructor(
    private readonly name: string,
    private readonly posture: Posture,
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly ctx: Ctx,
    private readonly env: EditorEnv,
  ) {
    this.node = node
    const doc = view.dom.ownerDocument
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
      const element = doc.createElement(tag)
      element.className = className
      return element
    }

    this.dom = make('div', 'adestia-edblock')
    this.dom.dataset['block'] = name

    this.bar = make('div', 'adestia-edblock__bar')
    this.bar.contentEditable = 'false'
    const label = make('span', 'adestia-edblock__name')
    label.textContent = `:::${name}`
    this.bar.append(label)
    if (posture === 'data') {
      this.toggle = make('button', 'adestia-edblock__toggle')
      this.toggle.type = 'button'
      this.toggle.addEventListener('mousedown', (event) => {
        event.preventDefault()
        this.setRaw(!this.raw)
      })
      this.bar.append(this.toggle)
    }
    // Moving a block is done from here, not with Crepe's handle — which aims
    // at the editor's middle and drops a block INSIDE another (`milkdown.ts`).
    const action = (symbol: string, title: string, run: () => void, className = '') => {
      const button = make('button', `adestia-edblock__act ${className}`.trim())
      button.type = 'button'
      button.title = title
      button.setAttribute('aria-label', title)
      button.textContent = symbol
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        run()
      })
      this.bar.append(button)
      return button
    }
    action('↑', 'Monter le bloc', () => this.move(-1))
    action('↓', 'Descendre le bloc', () => this.move(1))
    this.lift = action('⤴', 'Sortir du bloc parent', () => this.liftOut(), 'adestia-edblock__lift')
    action('✕', 'Supprimer le bloc', () => this.remove(), 'adestia-edblock__remove')
    const gear = make('button', 'adestia-edblock__gear')
    gear.type = 'button'
    gear.title = 'Réglages du bloc'
    gear.setAttribute('aria-label', 'Réglages du bloc')
    gear.textContent = '⚙'
    gear.addEventListener('mousedown', (event) => {
      event.preventDefault()
      this.setOpen(!this.open)
    })
    this.bar.append(gear)

    this.panel = make('div', 'adestia-edblock__panel')
    this.panel.contentEditable = 'false'
    this.dom.append(this.bar, this.panel)

    if (posture === 'prose') {
      this.head = make('header', 'adestia-head')
      this.head.contentEditable = 'false'
      this.head.addEventListener('mousedown', (event) => {
        event.preventDefault()
        this.setOpen(true)
      })
      this.contentDOM = make('div', 'adestia-edblock__body')
      this.dom.append(this.head, this.contentDOM)
    } else {
      this.preview = make('div', 'adestia-edblock__preview')
      this.preview.contentEditable = 'false'
      // A click on the rendering is how a person asks to change it: the raw
      // lines for a data block, the settings for one with no body. It never
      // FOLLOWS a link in there — a list row or a file would leave the page
      // being written.
      this.preview.addEventListener('mousedown', (event) => {
        event.preventDefault()
        if (posture === 'data') this.setRaw(true)
        else this.setOpen(true)
      })
      this.preview.addEventListener('click', (event) => event.preventDefault(), true)
      this.dom.append(this.preview)
      if (posture === 'data') {
        this.contentDOM = make('div', 'adestia-edblock__body adestia-edblock__body--raw')
        this.dom.append(this.contentDOM)
      }
    }

    this.open = settingsForNext
    settingsForNext = false
    this.refresh()
  }

  private get attributes(): Attributes {
    return (this.node.attrs['attributes'] ?? {}) as Attributes
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.refresh()
    return true
  }

  /** Everything drawn from the node's attributes, redrawn when they change. */
  private refresh(): void {
    const attributes = this.attributes
    if (attributes['w']) this.dom.dataset['w'] = attributes['w']
    else delete this.dom.dataset['w']
    this.dom.classList.toggle('adestia-edblock--open', this.open)
    // `⤴` only for a block that sits inside another.
    const at = this.getPos()
    this.lift.hidden = at === undefined || this.view.state.doc.resolve(at).depth === 0

    if (this.posture === 'prose') this.dressProse(attributes)
    else this.renderPreview()

    if (this.toggle) {
      this.toggle.textContent = this.raw ? 'Aperçu' : 'Modifier'
      this.dom.classList.toggle('adestia-edblock--raw', this.raw)
    }
    this.renderPanel()
  }

  /**
   * A prose block wears the reader's classes on its own element, so the
   * reader's stylesheet draws it: `.adestia-framed` with its band,
   * `.adestia-callout` with its tone, `.adestia-content` with its spacing.
   */
  private dressProse(attributes: Attributes): void {
    const framed = attributes['frame'] === 'card'
    const tone = attributes['type'] ?? 'note'
    const classes = ['adestia-edblock', 'adestia-edblock--prose']
    const body = ['adestia-edblock__body']
    let title = attributes['title']
    let by = ''

    if (this.name === 'content') {
      classes.push('adestia-content')
      title = title ?? (attributes['type'] ? prettify(attributes['type']) : '')
      by = [attributes['by'], attributes['on']].filter(Boolean).join(' · ')
    } else if (this.name === 'callout') {
      if (framed) body.push('adestia-callout', `adestia-callout--${tone}`)
      else classes.push('adestia-callout', `adestia-callout--${tone}`)
    } else if (this.name === 'gallery') {
      body.push('adestia-gallery')
    } else if (this.name === 'table') {
      body.push('adestia-table-scroll', 'adestia-tableblock')
    }
    const hasHead = Boolean(title || attributes['ico'] || by)
    if (framed) classes.push('adestia-framed')
    else if (hasHead && this.name !== 'content' && this.name !== 'callout') classes.push('adestia-titled')
    if (this.open) classes.push('adestia-edblock--open')

    setClass(this.dom, classes.join(' '))
    if (this.contentDOM) setClass(this.contentDOM, body.join(' '))
    if (this.head) {
      this.head.hidden = !hasHead
      fillHead(this.head, { title, ico: attributes['ico'], by })
    }
  }

  /** The block as the reader draws it, from the node's own markdown. */
  private renderPreview(): void {
    if (!this.preview) return
    setClass(this.dom, `adestia-edblock adestia-edblock--${this.posture}${this.open ? ' adestia-edblock--open' : ''}`)
    this.preview.hidden = this.raw
    if (this.raw) return
    this.previewRoot ??= createRoot(this.preview)
    const env = this.env
    this.previewRoot.render(
      <Reader
        markdown={this.markdownOf()}
        {...(env.path ? { path: env.path } : {})}
        {...(env.store ? { store: env.store } : {})}
        {...(env.fields ? { fields: env.fields } : {})}
        {...(env.blocks ? { blocks: env.blocks } : {})}
        {...(env.vocabulary ? { vocabulary: env.vocabulary } : {})}
        {...(env.pages ? { pages: env.pages } : {})}
        {...(env.fetchImpl ? { fetchImpl: env.fetchImpl } : {})}
        {...(env.locale ? { locale: env.locale } : {})}
      />,
    )
  }

  /**
   * This block alone, as markdown — through the editor's own serializer, so
   * the preview draws exactly what would be saved. Without its width: the
   * editor already sizes the block, and the reader would size it again.
   */
  private markdownOf(): string {
    const attributes = { ...this.attributes }
    delete attributes['w']
    const copy = this.node.type.create({ attributes }, this.node.content, this.node.marks)
    const doc = this.view.state.schema.topNodeType.create(null, copy)
    try {
      return this.ctx.get(serializerCtx)(doc)
    } catch {
      return ''
    }
  }

  private renderPanel(): void {
    this.panel.hidden = !this.open
    if (!this.open) {
      this.panelRoot?.render(null)
      return
    }
    this.panelRoot ??= createRoot(this.panel)
    // Once drawn — React commits on its own schedule — kept inside the
    // canvas: anchored to the block's right edge, a panel wider than a
    // narrow block spilled off the page.
    requestAnimationFrame(() => requestAnimationFrame(() => this.keepPanelInside()))
    const resolved = resolveBlock(this.name, this.env.vocabulary ?? {})
    this.panelRoot.render(
      <BlockSettings
        name={this.name}
        spec={resolved?.spec}
        attributes={this.attributes}
        onChange={(next) => this.write(next)}
        onClose={() => this.setOpen(false)}
      />,
    )
  }

  private keepPanelInside(): void {
    if (!this.open) return
    this.panel.style.transform = ''
    const bounds = (this.dom.closest('.adestia-canvas') ?? this.view.dom).getBoundingClientRect()
    const box = this.panel.getBoundingClientRect()
    const margin = 8
    let shift = 0
    if (box.right > bounds.right - margin) shift = bounds.right - margin - box.right
    if (box.left + shift < bounds.left + margin) shift = bounds.left + margin - box.left
    if (shift !== 0) this.panel.style.transform = `translateX(${Math.round(shift)}px)`
  }

  private write(attributes: Attributes): void {
    const at = this.getPos()
    if (at === undefined) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(at, undefined, { ...this.node.attrs, attributes }))
  }

  /** One place up or down among its siblings, and still selected there. */
  private move(direction: -1 | 1): void {
    const at = this.getPos()
    if (at === undefined) return
    const { state } = this.view
    const $at = state.doc.resolve(at)
    const index = $at.index()
    const neighbour = $at.parent.maybeChild(index + direction)
    if (!neighbour) return
    const size = this.node.nodeSize
    const to = direction < 0 ? at - neighbour.nodeSize : at + neighbour.nodeSize
    const tr = state.tr.delete(at, at + size).insert(to, this.node)
    tr.setSelection(NodeSelection.create(tr.doc, to))
    this.view.dispatch(tr.scrollIntoView())
  }

  /** Out of the block it sits in, just after it. */
  private liftOut(): void {
    const at = this.getPos()
    if (at === undefined) return
    const { state } = this.view
    const $at = state.doc.resolve(at)
    if ($at.depth === 0) return
    const tr = state.tr.delete(at, at + this.node.nodeSize)
    const to = tr.mapping.map($at.after($at.depth))
    tr.insert(to, this.node)
    tr.setSelection(NodeSelection.create(tr.doc, to))
    this.view.dispatch(tr.scrollIntoView())
  }

  /** Gone — and back with Cmd+Z, like any other edit. */
  private remove(): void {
    const at = this.getPos()
    if (at === undefined) return
    this.view.dispatch(this.view.state.tr.delete(at, at + this.node.nodeSize))
    this.view.focus()
  }

  private setOpen(open: boolean): void {
    this.open = open
    this.refresh()
  }

  private setRaw(raw: boolean): void {
    this.raw = raw
    this.refresh()
    if (!raw) return
    // Straight into the lines: the caret at the start of the body, so the
    // click that asked to edit is also where typing begins.
    const at = this.getPos()
    if (at === undefined) return
    const state = this.view.state
    this.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(at + 1))))
    this.view.focus()
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode')
  }

  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode')
  }

  /** The bar, the settings and the rendering are the view's, not the document's. */
  stopEvent(event: Event): boolean {
    const target = event.target as globalThis.Node | null
    if (!target) return false
    return (
      this.bar.contains(target) ||
      this.panel.contains(target) ||
      (this.preview?.contains(target) ?? false) ||
      (this.head?.contains(target) ?? false)
    )
  }

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: globalThis.Node }): boolean {
    if (mutation.type === 'selection') return false
    // The body's own CLASS is the view's business — it carries the reader's
    // classes for this block. Read as a content change, it made ProseMirror
    // re-parse the block and build a fresh view, which closed the settings
    // the very click that opened them.
    if (mutation.type === 'attributes' && mutation.target === this.contentDOM) return true
    return !(this.contentDOM?.contains(mutation.target) ?? false)
  }

  destroy(): void {
    // Deferred: a root cannot be unmounted while React may still be
    // rendering it, and ProseMirror destroys views inside its own updates.
    const roots = [this.previewRoot, this.panelRoot]
    queueMicrotask(() => {
      for (const root of roots) root?.unmount()
    })
  }
}

/** Only when it changes: every write is a mutation somebody has to judge. */
function setClass(element: HTMLElement, name: string): void {
  if (element.className !== name) element.className = name
}

/** The reader's header markup — `BlockHead` — built without React, in place. */
function fillHead(
  head: HTMLElement,
  { title, ico, by }: { title?: string | undefined; ico?: string | undefined; by?: string | undefined },
): void {
  const doc = head.ownerDocument
  const parts: HTMLElement[] = []
  if (ico) {
    const glyph = doc.createElement('span')
    glyph.className = 'adestia-head__ico'
    glyph.setAttribute('aria-hidden', 'true')
    glyph.textContent = ico
    parts.push(glyph)
  }
  if (title) {
    const heading = doc.createElement('h3')
    heading.className = 'adestia-head__title'
    heading.textContent = title
    parts.push(heading)
  }
  if (by) {
    const signed = doc.createElement('p')
    signed.className = 'adestia-head__by'
    signed.textContent = by
    parts.push(signed)
  }
  head.replaceChildren(...parts)
}
