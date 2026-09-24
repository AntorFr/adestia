/**
 * The frontmatter strip, WHILE the page is being written — and the ⚙ that
 * opens it.
 *
 * Reading posture draws the page's frontmatter as a row of chips, which is
 * right: five lines of grey `key: value` above every page is apparatus, not
 * content. Writing posture had exactly the same row and nothing behind it, so
 * the one thing a person could not change about a page was what the page
 * SAYS it is — its subject, its state, the tags it is found by. The
 * properties are reachable now, by the same gesture a block's settings are:
 * a bar, a ⚙, a form.
 *
 * Why it lives in a node view rather than beside the editor, which was the
 * obvious other answer: the frontmatter is part of the document Milkdown
 * holds. A form writing it from outside would be a SECOND author on an open
 * file, and the editor's very next keystroke would put back what it captured
 * when it mounted — the scar the title field already carries (`Editor.tsx`,
 * where the title is held apart and recomposed on every render). Writing
 * through a transaction instead puts the change where every other change
 * goes: in the document, in the undo history, saved by the same autosave.
 */

import {
  readFrontmatter,
  toneOf,
  writeFrontmatter,
  type FieldValue,
  type Indexed,
} from '@antorfr/adestia-content'
import type { Ctx } from '@milkdown/kit/ctx'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { createRoot, type Root } from 'react-dom/client'

import type { EditorEnv } from './blockview.js'
import { PageSettings } from './PageSettings.js'
import type { FieldContributions } from './pageform.js'

/** What the strip needs beyond what a block's rendering needs. */
export interface PropertiesEnv extends EditorEnv {
  /** What the active plugins declare, by page type. */
  readonly contributions?: FieldContributions | undefined
  /** Keys drawn elsewhere on screen — the title, when a caller owns it. */
  readonly without?: readonly string[] | undefined
  readonly t?: ((key: string) => string) | undefined
}

export function frontmatterView(env: PropertiesEnv) {
  return (_ctx: Ctx) =>
    (node: ProseNode, view: EditorView, getPos: () => number | undefined): NodeView =>
      new FrontmatterView(node, view, getPos, env)
}

/**
 * The chips — the same ones a section card and the reader wear.
 *
 * Fields whose job is LIVERY (`ico`, `couleur`) or navigation (`title`) are
 * not shown: the title is already the page's heading and the icon already
 * dressed the tile you arrived by. What is left is what the page says about
 * itself.
 *
 * ⚠️ The reader builds the same row from the raw YAML (`Reader.tsx`), and the
 * two must keep agreeing — the strip is drawn by one of them or the other
 * depending only on which posture the page is in, and a page that changed
 * appearance when somebody pressed the pencil would read as a page that
 * changed.
 */
function chipsFor(fields: Readonly<Record<string, FieldValue>>): { text: string; className: string }[] {
  const chips: { text: string; className: string }[] = []
  const status = fields['status'] ?? fields['statut']
  if (typeof status === 'string' && status !== '') {
    // The tone is asked of the content engine's own table, never guessed: a
    // page marked `terminé` wore the accent here and the success colour
    // everywhere else, so the same page changed meaning when you pressed the
    // pencil.
    chips.push({ text: status, className: `adestia-stat adestia-stat--${toneOf(status)}` })
  }
  for (const key of ['type', 'cat', 'role']) {
    const value = fields[key]
    if (typeof value === 'string' && value !== '') chips.push({ text: value, className: 'adestia-tag' })
  }
  const tags = fields['tags']
  for (const tag of Array.isArray(tags) ? tags : typeof tags === 'string' && tags ? [tags] : []) {
    chips.push({ text: `#${String(tag)}`, className: 'adestia-tag' })
  }
  return chips
}

class FrontmatterView implements NodeView {
  readonly dom: HTMLElement
  private node: ProseNode
  private readonly chips: HTMLElement
  private readonly gear: HTMLButtonElement
  private readonly panel: HTMLElement
  private panelRoot?: Root
  private open = false

  constructor(
    node: ProseNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly env: PropertiesEnv,
  ) {
    this.node = node
    const doc = view.dom.ownerDocument
    const t = env.t ?? ((key: string) => key)

    this.dom = doc.createElement('div')
    this.dom.className = 'adestia-editor__meta adestia-editor__meta--edit'
    this.dom.contentEditable = 'false'

    this.chips = doc.createElement('span')
    this.chips.className = 'adestia-editor__meta-chips'

    this.gear = doc.createElement('button')
    this.gear.type = 'button'
    this.gear.className = 'adestia-editor__meta-gear'
    this.gear.title = t('Page properties')
    this.gear.setAttribute('aria-label', t('Page properties'))
    this.gear.textContent = '⚙'
    this.gear.addEventListener('mousedown', (event) => {
      event.preventDefault()
      this.setOpen(!this.open)
    })

    this.panel = doc.createElement('div')
    this.panel.className = 'adestia-editor__meta-panel'
    this.panel.contentEditable = 'false'
    this.panel.hidden = true

    this.dom.append(this.chips, this.gear, this.panel)
    this.refresh()
  }

  update(node: ProseNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.refresh()
    return true
  }

  /** The YAML this node carries, as a document the form can read. */
  private get read() {
    return readFrontmatter(`---\n${(this.node.attrs['value'] as string) ?? ''}\n---\n`)
  }

  private setOpen(open: boolean): void {
    this.open = open
    this.refresh()
  }

  private refresh(): void {
    const read = this.read
    const doc = this.dom.ownerDocument
    this.dom.classList.toggle('adestia-editor__meta--open', this.open)

    this.chips.textContent = ''
    const chips = chipsFor(read.fields)
    if (chips.length === 0) {
      const empty = doc.createElement('span')
      empty.className = 'adestia-editor__meta-none'
      empty.textContent = (this.env.t ?? ((key: string) => key))('no properties')
      this.chips.append(empty)
    }
    for (const chip of chips) {
      const span = doc.createElement('span')
      span.className = chip.className
      span.textContent = chip.text
      this.chips.append(span)
    }

    this.panel.hidden = !this.open
    if (!this.open) {
      this.panelRoot?.render(null)
      return
    }
    this.panelRoot ??= createRoot(this.panel)
    this.panelRoot.render(
      <PageSettings
        fields={read.fields}
        opaque={read.opaque}
        broken={read.broken}
        pages={(this.env.pages ?? []) as readonly Indexed[]}
        {...(this.env.contributions ? { contributions: this.env.contributions } : {})}
        {...(this.env.locale ? { locale: this.env.locale } : {})}
        {...(this.env.without ? { without: this.env.without } : {})}
        {...(this.env.t ? { t: this.env.t } : {})}
        onChange={(key, value) => this.write(key, value)}
        onClose={() => this.setOpen(false)}
      />,
    )
  }

  /**
   * One field, written into the node's own YAML.
   *
   * Through `writeFrontmatter`, which is the whole safety of this screen: the
   * lines it does not model come back exactly as they were, and a value that
   * would not parse as one value is quoted rather than written raw.
   */
  private write(key: string, value: FieldValue | undefined): void {
    const at = this.getPos()
    if (at === undefined) return
    const current = (this.node.attrs['value'] as string) ?? ''
    const next = writeFrontmatter(`---\n${current}\n---\n`, { [key]: value })
    const head = /^---\n([\s\S]*?)\n---/.exec(next)?.[1] ?? ''
    if (head === current) return
    this.view.dispatch(this.view.state.tr.setNodeMarkup(at, undefined, { value: head }))
  }

  /** The strip, its ⚙ and its form are the view's, not the document's. */
  stopEvent(event: Event): boolean {
    const target = event.target as globalThis.Node | null
    return target !== null && this.dom.contains(target)
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    // Deferred: a root cannot be unmounted while React may still be rendering
    // it, and ProseMirror destroys views inside its own updates.
    const root = this.panelRoot
    queueMicrotask(() => root?.unmount())
  }
}
