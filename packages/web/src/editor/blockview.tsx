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
 * Every block carries a small bar with its name and a settings button, which
 * opens its settings window (`BlockSettings`): the attributes it declares and the reserved
 * ones — title, icon, card, width. The layout the reader gives `w=` bands is
 * given here too, by CSS on the editor surface (`editor.css`).
 */

import { resolveBlock, type Indexed } from '@antorfr/adestia-content'
import { parserCtx, serializerCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { redo, undo } from '@milkdown/kit/prose/history'
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { createRoot, type Root } from 'react-dom/client'

import { BlockForm } from './BlockForm.js'
import { bodyLines, fenced } from './blockform/index.js'
import { BlockSettings } from './BlockSettings.js'
import { domIcon } from './dom-icon.js'
import type { IconName } from '../app/icons.js'
import { prettify } from '../app/paths.js'
import { moveBlock, slotAtPos, slotToIndex } from './moveBlock.js'
import { announce, canMove, moveByStep, moveTo, placeOf, said, stepOf } from './moveui.js'
import { Reader, type BlockComponents, type VocabularyContext } from './Reader.js'
import type { PluginGalleryFields } from '@antorfr/adestia-schemas'
import type { Say } from '../plugins/words.js'

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
  /**
   * A word a PLUGIN declared, in the reader's language. A block's
   * `description` is written in a manifest — read before the plugin's code
   * runs — so the settings panel cannot get it translated any other way.
   */
  readonly say?: Say | undefined
  /** The form a block declares for its lines (`fields`), absent for a block with none (E-35). */
  readonly forms?: ((name: string) => PluginGalleryFields | undefined) | undefined
  /** The editor's translator: the bar, the settings and the notes speak the instance's language. */
  readonly t?: ((key: string) => string) | undefined
}

/** How long a finger rests on the grip before the drag starts (AD-deplacer-1). */
const LONG_PRESS_MS = 400

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
  private readonly up: HTMLButtonElement
  private readonly down: HTMLButtonElement
  /** The ⚙ as a ref, which is what the settings window hangs from and returns focus to. */
  private readonly anchor: { current: HTMLElement | null }
  private readonly t: (key: string) => string
  /** A data block showing its raw lines rather than its rendering. */
  private raw = false
  private open: boolean
  /** The data form (E-35), with the lines the block had when it opened. */
  private form: { readonly base: string } | undefined

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
    const t = (this.t = env.t ?? ((key) => key))
    const label = make('span', 'adestia-edblock__name')
    label.textContent = `:::${name}`
    this.bar.append(label)
    const buttonClasses = 'adestia-btn adestia-btn--ghost adestia-btn--sm'
    if (posture === 'data') {
      this.toggle = make('button', `${buttonClasses} adestia-edblock__toggle`)
      this.toggle.type = 'button'
      this.toggle.addEventListener('mousedown', (event) => {
        event.preventDefault()
        this.setRaw(!this.raw)
      })
      this.bar.append(this.toggle)
    }
    // Moving a block is done from here, not with Crepe's handle — which aims
    // at the editor's middle and drops a block INSIDE another (`milkdown.ts`).
    // Each control is an icon button named by `aria-label` and `title`, both
    // in the instance's language.
    const iconButton = (icon: IconName, title: string, className: string) => {
      const button = make('button', `${buttonClasses} adestia-btn--icon ${className}`)
      button.type = 'button'
      button.title = title
      button.setAttribute('aria-label', title)
      button.append(domIcon(doc, icon))
      return button
    }
    const action = (icon: IconName, title: string, run: () => void, className = '') => {
      const button = iconButton(icon, title, `adestia-edblock__act ${className}`.trim())
      button.addEventListener('mousedown', (event) => {
        event.preventDefault()
        run()
      })
      this.bar.append(button)
      return button
    }
    const grip = iconButton('grip-vertical', t('Move block'), 'adestia-edblock__grip')
    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      this.press(event)
    })
    // A long press on a phone must not become the browser's text selection or menu.
    grip.addEventListener('contextmenu', (event) => event.preventDefault())
    this.bar.append(grip)
    this.up = action('arrow-up', t('Move up'), () => this.step(-1), 'adestia-edblock__up')
    this.down = action('arrow-up', t('Move down'), () => this.step(1), 'adestia-edblock__down')
    // Alt+↑/↓ from anywhere in the block: its bar, or the caret in its body.
    // Neighbours moved without this view being told: read the ends again when it is reached.
    this.dom.addEventListener('pointerover', () => this.syncMove())
    this.dom.addEventListener('focusin', () => this.syncMove())
    this.dom.addEventListener('keydown', (event) => {
      const direction = stepOf(event)
      if (!direction) return
      event.preventDefault()
      event.stopPropagation()
      this.step(direction, true)
    })
    this.lift = action('corner-left-up', t('Leave the parent block'), () => this.liftOut(), 'adestia-edblock__lift')
    action('trash-2', t('Delete block'), () => this.remove(), 'adestia-edblock__remove')
    const gear = iconButton('settings', t('Block settings'), 'adestia-edblock__gear')
    this.anchor = { current: gear }
    gear.addEventListener('mousedown', (event) => {
      event.preventDefault()
      // Focus goes to the ⚙ itself, so that closing the window gives it back here.
      if (!this.open) gear.focus()
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
      // What `:::row` says about itself in the editor — drawn by the stylesheet from this.
      this.preview.dataset['note'] = t('new line')
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
    // The lift button only for a block that sits inside another.
    const at = this.getPos()
    this.lift.hidden = at === undefined || this.view.state.doc.resolve(at).depth === 0

    if (this.posture === 'prose') this.dressProse(attributes)
    else this.renderPreview()

    if (this.toggle) {
      // The word and its icon: raw lines call for the way back to the rendering.
      this.toggle.replaceChildren(
        domIcon(this.toggle.ownerDocument, this.raw ? 'eye' : 'code'),
        this.toggle.ownerDocument.createTextNode(this.raw ? this.t('Preview') : this.t('Edit')),
      )
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
    this.panel.hidden = !this.open && !this.form
    if (!this.open && !this.form) {
      this.panelRoot?.render(null)
      return
    }
    this.panelRoot ??= createRoot(this.panel)
    const resolved = resolveBlock(this.name, this.env.vocabulary ?? {})
    // Said by whoever declared the block: the owning plugin for a contributed
    // one, the shell for a core one (`plugin` is then `core`, which no table
    // answers for, so it falls through to the shell's own words).
    const about = resolved
      ? (this.env.say?.(resolved.plugin, resolved.spec.description) ?? resolved.spec.description)
      : undefined
    const fields = this.env.forms?.(this.name)
    const label = prettify(this.name)
    this.panelRoot.render(
      <>
        {this.open && (
          // The window is portaled out of the panel, but React events still
          // climb through it: this is where its keys reach the editor.
          <div style={{ display: 'contents' }} onKeyDown={(event) => this.historyKey(event)}>
          <BlockSettings
            name={this.name}
            spec={resolved?.spec}
            {...(about ? { about } : {})}
            attributes={this.attributes}
            anchor={this.anchor}
            t={this.t}
            onChange={(next) => this.write(next)}
            onClose={() => this.setOpen(false)}
            {...(fields ? { onEditData: () => this.openForm() } : {})}
          />
          </div>
        )}
        {this.form && fields && (
          <BlockForm
            name={label}
            fields={fields}
            lines={bodyLines(this.form.base)}
            stale={this.markdownOf() !== this.form.base}
            locale={this.env.locale}
            t={this.t}
            onApply={(lines) => this.applyLines(lines)}
            onClose={() => this.closeForm()}
          />
        )}
      </>,
    )
  }

  /**
   * Focus sits in the settings window after a choice, outside the editor's own
   * key handling: hand undo/redo to its history, but leave a text field its
   * native undo.
   */
  private historyKey(event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; key: string; target: EventTarget; preventDefault(): void }): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
    const key = event.key.toLowerCase()
    const run = key === 'z' ? (event.shiftKey ? redo : undo) : key === 'y' ? redo : undefined
    if (!run) return
    event.preventDefault()
    run(this.view.state, this.view.dispatch)
  }

  private openForm(): void {
    this.form = { base: this.markdownOf() }
    this.open = false
    this.refresh()
  }

  private closeForm(): void {
    this.form = undefined
    this.refresh()
  }

  /** The form's lines become the block's body: one change of the document, one undo step. */
  private applyLines(lines: string[]): void {
    const at = this.getPos()
    const fresh = this.ctx.get(parserCtx)(fenced(this.name, lines)).firstChild
    if (at !== undefined && fresh && fresh.type === this.node.type && this.form && this.markdownOf() === this.form.base) {
      this.view.dispatch(
        this.view.state.tr.replaceWith(at + 1, at + this.node.nodeSize - 1, fresh.content).scrollIntoView(),
      )
    }
    this.closeForm()
  }

  private write(attributes: Attributes): void {
    const at = this.getPos()
    if (at === undefined) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(at, undefined, { ...this.node.attrs, attributes }))
  }

  /** The page-level place of this block, or undefined for one inside another (tranche 3). */
  private place(): { index: number; total: number; at: number } | undefined {
    const at = this.getPos()
    if (at === undefined || this.view.state.doc.resolve(at).depth !== 0) return undefined
    const { index, total } = placeOf(this.view, at)
    return index < 0 ? undefined : { index, total, at }
  }

  /** Move up / Move down: disabled at the ends, hidden for a nested block. */
  private syncMove(): void {
    const place = this.place()
    this.up.hidden = this.down.hidden = place === undefined
    if (!place) return
    this.up.disabled = !canMove(this.view, place.index, -1)
    this.down.disabled = !canMove(this.view, place.index, 1)
  }

  /** One place up or down, from a button or Alt+↑/↓; focus follows the control used. */
  private step(direction: -1 | 1, fromKey = false): void {
    const place = this.place()
    if (!place) return
    const focused = this.dom.ownerDocument.activeElement
    const onBar = focused instanceof HTMLElement && this.bar.contains(focused) ? focused.className : undefined
    const moved = moveByStep(this.view, place.index, direction, this.t)
    if (moved === undefined) return
    // The move rebuilds the view; give the keyboard back to the same control.
    const next = this.view.nodeDOM(moved)
    if (!(next instanceof HTMLElement)) return
    const control = fromKey && onBar ? next.querySelector<HTMLElement>(`.adestia-edblock__bar > button[class="${onBar}"]`) : null
    if (control) control.focus()
    else if (fromKey) this.view.focus()
  }

  /** A press on the grip: the pointer drags at once, a finger after 400 ms without moving. */
  private press(start: PointerEvent): void {
    if (start.pointerType !== 'touch') {
      this.startDrag(start)
      return
    }
    const doc = this.view.dom.ownerDocument
    let last = start
    const cancel = () => {
      clearTimeout(timer)
      doc.removeEventListener('pointermove', onMove)
      doc.removeEventListener('pointerup', cancel)
      doc.removeEventListener('pointercancel', cancel)
    }
    const timer = setTimeout(() => {
      cancel()
      this.startDrag(last)
    }, LONG_PRESS_MS)
    // A finger that travels before the delay is scrolling, not dragging.
    const onMove = (event: PointerEvent) => {
      last = event
      if (Math.hypot(event.clientX - start.clientX, event.clientY - start.clientY) > 10) cancel()
    }
    doc.addEventListener('pointermove', onMove)
    doc.addEventListener('pointerup', cancel)
    doc.addEventListener('pointercancel', cancel)
  }

  /**
   * Dragging the block to where the pointer is — ALWAYS between two things
   * at the top of the page, never inside a block. A line shows where it will
   * land: horizontal between full-width things, vertical inside a band. What
   * the drop would do is `moveBlock`'s answer; a refusal is said, not silent.
   */
  private startDrag(start: PointerEvent): void {
    const view = this.view
    const doc = view.dom.ownerDocument
    const from = this.place()?.index
    if (from === undefined) return
    const line = doc.createElement('div')
    line.className = 'adestia-drop-line'
    doc.body.append(line)
    this.dom.classList.add('adestia-edblock--dragging')
    doc.body.classList.add('adestia-dragging-block')
    const canvas = this.dom.closest('.adestia-canvas')
    let target: number | undefined

    const place = (x: number, y: number) => {
      if (canvas) {
        const edge = canvas.getBoundingClientRect()
        if (y < edge.top + 48) canvas.scrollBy(0, -14)
        else if (y > edge.bottom - 48) canvas.scrollBy(0, 14)
      }
      const found = dropTarget(view, x, y)
      target = found?.pos
      const result = found ? moveBlock(view.state.doc, from, view.state.doc, this.indexFor(from, found.pos)) : undefined
      if (!found || !result?.ok) {
        line.hidden = true
        announce(doc, result ? said(result, this.t) : '')
        return
      }
      announce(doc, '')
      line.hidden = false
      Object.assign(line.style, found.line)
    }
    const stop = (commit: boolean) => {
      doc.removeEventListener('pointermove', onMove)
      doc.removeEventListener('pointerup', onUp)
      doc.removeEventListener('keydown', onKey, true)
      line.remove()
      this.dom.classList.remove('adestia-edblock--dragging')
      doc.body.classList.remove('adestia-dragging-block')
      announce(doc, '')
      if (commit && target !== undefined) moveTo(view, from, this.indexFor(from, target), this.t)
    }
    const onMove = (event: PointerEvent) => place(event.clientX, event.clientY)
    const onUp = () => stop(true)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      stop(false)
    }
    doc.addEventListener('pointermove', onMove)
    doc.addEventListener('pointerup', onUp)
    doc.addEventListener('keydown', onKey, true)
    place(start.clientX, start.clientY)
  }

  /** The index block `from` will have if dropped at document position `pos`. */
  private indexFor(from: number, pos: number): number {
    return slotToIndex(from, slotAtPos(this.view.state.doc, pos))
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
    this.syncMove()
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

/**
 * Where a dragged block would land under the pointer: a position between two
 * top-level nodes, and the line that says so, in viewport coordinates.
 * Inside a band the halves are left and right; anywhere else, top and bottom.
 * Never before the frontmatter, which is the file's first lines.
 */
function dropTarget(
  view: EditorView,
  x: number,
  y: number,
): { pos: number; line: Partial<CSSStyleDeclaration> } | undefined {
  type Slot = { pos: number; size: number; rect: DOMRect; banded: boolean; first: boolean }
  const slots: Slot[] = []
  view.state.doc.forEach((node, offset) => {
    const element = view.nodeDOM(offset)
    if (!(element instanceof HTMLElement)) return
    slots.push({
      pos: offset,
      size: node.nodeSize,
      rect: element.getBoundingClientRect(),
      banded: Boolean(element.dataset['w']),
      first: node.type.name === 'frontmatter',
    })
  })
  const usable = slots.filter((slot) => !slot.first && slot.rect.height > 0)
  if (usable.length === 0) return undefined
  // The slot under the pointer, else the nearest one vertically.
  const under =
    usable.find((slot) => y >= slot.rect.top && y <= slot.rect.bottom && x >= slot.rect.left && x <= slot.rect.right) ??
    usable.reduce((best, slot) => {
      const distance = (one: Slot) => (y < one.rect.top ? one.rect.top - y : y > one.rect.bottom ? y - one.rect.bottom : 0)
      return distance(slot) < distance(best) ? slot : best
    })
  const { rect } = under
  if (under.banded) {
    const before = x < rect.left + rect.width / 2
    return {
      pos: before ? under.pos : under.pos + under.size,
      line: {
        left: `${Math.round((before ? rect.left : rect.right) + (before ? -6 : 4))}px`,
        top: `${Math.round(rect.top)}px`,
        width: '3px',
        height: `${Math.round(rect.height)}px`,
      },
    }
  }
  const before = y < rect.top + rect.height / 2
  return {
    pos: before ? under.pos : under.pos + under.size,
    line: {
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round((before ? rect.top : rect.bottom) + (before ? -5 : 3))}px`,
      width: `${Math.round(rect.width)}px`,
      height: '3px',
    },
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
