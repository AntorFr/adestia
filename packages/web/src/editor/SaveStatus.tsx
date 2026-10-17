import type { SaveState } from './useAutosave.js'

export function SaveStatus({ state }: { state: SaveState }) {
  switch (state.kind) {
    case 'idle':
      return null
    case 'saving':
      return <span className="adestia-save">Saving…</span>
    case 'saved':
      return (
        <span className="adestia-save adestia-save--ok">
          {/* Said out loud, because a silent reformat looks like the editor
              mangled something the user did not touch. */}
          {state.normalized ? 'Saved, tidied to house style' : 'Saved'}
        </span>
      )
    case 'conflict':
      return (
        <span className="adestia-save adestia-save--warn">
          The agent changed this page. Reload to see its version.
        </span>
      )
    case 'rejected':
      return (
        <span className="adestia-save adestia-save--error">
          Not saved: {state.diagnostics[0]?.message ?? 'the page breaks the vocabulary'}
        </span>
      )
    case 'failed':
      return <span className="adestia-save adestia-save--error">{state.message}</span>
  }
}

