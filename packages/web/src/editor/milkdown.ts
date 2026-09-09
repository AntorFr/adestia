/**
 * Mounting Milkdown.
 *
 * Kept apart from the component so the editor's behaviour — save, conflict,
 * read-only, diagnostics — is testable without dragging ProseMirror and a
 * full DOM into every run. The component takes `mount` as a prop; this is the
 * real implementation.
 */

import { Crepe, CrepeFeature } from '@milkdown/crepe'

// Crepe's own chrome — its toolbar, slash menu, block handles and tooltips.
// This sheet is STRUCTURE ONLY: every colour, font and shadow in it reads a
// `var(--crepe-*)` that one of Crepe's theme files is meant to declare. Adestia
// imports no theme on purpose — a second palette would compete with the
// skin's — and declares the whole `--crepe-*` set from its own tokens in
// shell.css instead. The two go together: importing this without that leaves
// the toolbar transparent and unshadowed, which is how the editing controls
// came to be invisible rather than absent.
import '@milkdown/crepe/theme/common/style.css'

import { buildBlockMenu } from './slash.js'
import { adestiaVocabulary } from './vocabulary.js'

export function mountMilkdown(
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
): () => void {
  const crepe = new Crepe({
    root: element,
    defaultValue: markdown,
    features: {
      // The AI panel wires an assistant Adestia does not own: the chat beside
      // the page IS the assistant, and a second one that answers to nobody
      // would be a dead control.
      [CrepeFeature.AI]: false,
    },
    featureConfigs: {
      // The vocabulary's blocks, in the `/` menu — see `slash.ts`.
      [CrepeFeature.BlockEdit]: { buildMenu: buildBlockMenu },
    },
  })

  crepe.editor.use(adestiaVocabulary())
  void crepe
    .create()
    .then(() => {
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, next) => onChange(next))
      })
    })
    // Never silently. `create()` rejects when the document holds a node this
    // editor has no parser for, and the rejection used to go nowhere: the
    // surface stayed EMPTY, the page still readable underneath, and nothing
    // on screen or in the console said why. Four core blocks shipped that way
    // for a day (2026-09-09), and the `table` collision that `PM_ID` now
    // settles was read off a blank rectangle with a fifteen-second wait in
    // front of it. The parse failure is written where the editor would have
    // been, so the next one is a sentence rather than a wait.
    .catch((cause: unknown) => {
      console.error('Adestia: the editor could not open this page', cause)
      const problem = element.ownerDocument.createElement('p')
      problem.className = 'adestia-editor__problem'
      problem.setAttribute('role', 'status')
      problem.textContent = `The editor could not open this page: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
      element.replaceChildren(problem)
    })

  // A page switch must tear the editor down: two live instances on one host
  // leave the second reading the first's document.
  return () => void crepe.destroy()
}
