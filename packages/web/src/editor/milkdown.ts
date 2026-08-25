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
// Never imported until now, so every one of those rendered unstyled: the
// editing controls a person actually clicks were raw markup on the page. The
// theme below is deliberately the NEUTRAL one; Golem's tokens dress it in
// shell.css rather than a second palette competing with the skin's.
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
