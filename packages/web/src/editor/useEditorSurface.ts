import { useEffect, useRef } from 'react'
import type { EditorProps } from './Editor.js'
import type { PropertiesEnv } from './frontmatterview.js'

export function useEditorSurface(
  { page, mount, blocks, vocabulary, pages, fetchImpl, locale, fieldContributions, titleField, t, say }: EditorProps,
  editing: boolean,
  shown: string,
  saved: string,
  setBody: (markdown: string) => void,
) {
  const host = useRef<HTMLDivElement>(null)
  /*
   * What a block drawn in the editor needs to render the way it reads: the
   * page it sits in, the plugins' blocks, the index. Read through a ref at
   * MOUNT time and never a dependency — the index refreshing under an open
   * editor must not remount it and throw away what is being typed.
   */
  const env = useRef<PropertiesEnv>({})
  env.current = {
    path: page.path,
    store: page.store,
    fields: page.fields,
    blocks,
    vocabulary,
    pages,
    fetchImpl,
    locale,
    contributions: fieldContributions,
    /*
     * The title is drawn ABOVE the document when a caller asks for it, and
     * two controls writing one field is the 409 this editor spends its
     * comments warning about. The properties form yields: the field is
     * already on screen, three inches higher.
     */
    without: titleField ? ['title'] : undefined,
    t,
    say,
  }

  /*
   * What the surface opens ON is `saved`, not `shown`.
   *
   * `shown` is the document as it was fetched and never moves again, so
   * reopening the editor after a save handed Milkdown the text from BEFORE
   * that save — while the reader, fed by `markdown`, drew the new one. The
   * first keystroke then reported "stale text plus a letter" and the
   * auto-save wrote it over the file: a journal entry written and closed came
   * back empty at the next ✎, and the empty version was kept.
   *
   * Read through a ref and never a dependency, like `env`: `saved` advances
   * on every save, and remounting the editor under a cursor on each one
   * would throw away what is being typed.
   */
  const opening = useRef(saved)
  /*
   * ...except in the render where `shown` just changed (a reload took the
   * agent's version): `saved` only follows in an effect, one render later,
   * and the remount in this very render would open on the old text.
   */
  const lastShown = useRef(shown)
  if (lastShown.current !== shown) {
    lastShown.current = shown
    opening.current = shown
  } else {
    opening.current = saved
  }

  useEffect(() => {
    if (!editing || !mount || !host.current || !page.editable) return undefined
    return mount(host.current, opening.current, setBody, env.current)
  }, [editing, mount, page.editable, shown, page.path, setBody])

  return host
}
