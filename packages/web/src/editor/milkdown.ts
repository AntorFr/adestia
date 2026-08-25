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
// `var(--crepe-*)` that one of Crepe's theme files is meant to declare. Golem
// imports no theme on purpose — a second palette would compete with the
// skin's — and declares the whole `--crepe-*` set from its own tokens in
// shell.css instead. The two go together: importing this without that leaves
// the toolbar transparent and unshadowed, which is how the editing controls
// came to be invisible rather than absent.
import '@milkdown/crepe/theme/common/style.css'

import { golemVocabulary } from './vocabulary.js'

export function mountMilkdown(
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
): () => void {
  const crepe = new Crepe({
    root: element,
    defaultValue: markdown,
    features: {
      // The AI panel wires an assistant Golem does not own: the chat beside
      // the page IS the assistant, and a second one that answers to nobody
      // would be a dead control.
      [CrepeFeature.AI]: false,
    },
  })

  crepe.editor.use(golemVocabulary)
  void crepe.create().then(() => {
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, next) => onChange(next))
    })
  })

  // A page switch must tear the editor down: two live instances on one host
  // leave the second reading the first's document.
  return () => void crepe.destroy()
}
