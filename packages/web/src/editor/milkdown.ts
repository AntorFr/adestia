/**
 * Mounting Milkdown.
 *
 * Kept apart from the component so the editor's behaviour — save, conflict,
 * read-only, diagnostics — is testable without dragging ProseMirror and a
 * full DOM into every run. The component takes `mount` as a prop; this is the
 * real implementation.
 */

import { Crepe } from '@milkdown/crepe'

import { golemVocabulary } from './vocabulary.js'

export function mountMilkdown(
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
): () => void {
  const crepe = new Crepe({ root: element, defaultValue: markdown })

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
