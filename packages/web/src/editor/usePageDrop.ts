import { useCallback, useRef, useState } from 'react'
import type { EditorProps } from './Editor.js'
import { carriesFiles, fileDropMessage } from './filedrop.js'

export function usePageDrop(
  { page, attach, compose, t }: Pick<EditorProps, 'page' | 'attach' | 'compose'> & { t: (key: string) => string },
  editing: boolean,
) {
  const [dropping, setDropping] = useState(false)
  // Counted rather than toggled: dragging over a child fires `dragleave` on
  // the parent, and a boolean makes the overlay flicker on every word the
  // cursor crosses.
  const depth = useRef(0)
  /**
   * A file let go over the page.
   *
   * Only in reading posture: while editing, the surface belongs to the editor
   * and its own drag handling, and two things claiming one drop is how a
   * paragraph ends up somewhere nobody asked for.
   *
   * And only where `attach` was handed over. The shell's own page screen
   * passes it; an editor EMBEDDED by a plugin currently does not, so a task
   * or a journal entry takes no drop while the same document does on
   * `#/page/…` — see `plugins/PageEditor.tsx`.
   */
  const takesDrop = attach !== undefined && !editing

  const onDrop = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return
      void (async () => {
        await attach?.(files)
        compose?.(fileDropMessage(page, t))
      })()
    },
    [attach, compose, page, t],
  )

  const events = takesDrop
    ? {
        onDragEnter: (event: React.DragEvent) => {
          if (!carriesFiles(event.dataTransfer)) return
          depth.current += 1
          setDropping(true)
        },
        onDragOver: (event: React.DragEvent) => {
          // Without this the browser navigates to the file instead, which
          // loses the page somebody was reading.
          if (carriesFiles(event.dataTransfer)) event.preventDefault()
        },
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setDropping(false)
        },
        onDrop: (event: React.DragEvent) => {
          if (!carriesFiles(event.dataTransfer)) return
          event.preventDefault()
          depth.current = 0
          setDropping(false)
          onDrop([...event.dataTransfer.files])
        },
      }
    : {}
  return { dropping, events }
}
