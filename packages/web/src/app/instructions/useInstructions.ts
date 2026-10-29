/** The zone's state: the list, the places, and the text of the file that is open. */

import { useCallback, useEffect, useRef, useState } from 'react'

import { jsonInit, requestJson } from '../request.js'
import { fileUrl, type InstructionFile, type InstructionPath, type Kind } from './model.js'

/** How a read stands: the wait, the answer, or what went wrong and with which status. */
export interface Read {
  readonly status: 'loading' | 'ready' | 'failed'
  readonly error: string | undefined
  readonly httpStatus: number | undefined
}

const LOADING: Read = { status: 'loading', error: undefined, httpStatus: undefined }
const READY: Read = { status: 'ready', error: undefined, httpStatus: undefined }

export type Save =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed'; message: string }

/** A file being written for the first time, and its opening text. */
interface Seed {
  readonly path: string
  readonly text: string
}

/**
 * `t` defaults to a fresh function each render: a dependency of a loader would
 * re-run its effect forever, so the loaders read the latest through a ref.
 */
function useLatest(t: (key: string) => string) {
  const ref = useRef(t)
  ref.current = t
  return useCallback((key: string) => ref.current(key), [])
}

/**
 * The list, read once and again on demand (an import calls `reload`, so a new
 * card appears unprompted).
 */
export function useInstructionList(fetchImpl: typeof fetch, t: (key: string) => string) {
  const say = useLatest(t)
  const [files, setFiles] = useState<readonly InstructionFile[] | undefined>()
  /** Where one may be written — the listing only says what is already there. */
  const [places, setPlaces] = useState<readonly InstructionPath[]>([])
  const [supported, setSupported] = useState(true)
  const [read, setRead] = useState<Read>(LOADING)
  const latest = useRef(0)
  const held = useRef(false)

  /** Reads again. Silent once the list is held (an import must not blank it); `retry` shows the wait. */
  const reload = useCallback(async () => {
    const mine = ++latest.current
    const result = await requestJson<{
      files?: readonly InstructionFile[]
      paths?: readonly InstructionPath[]
    }>(fetchImpl, '/api/instructions', undefined, say)
    if (latest.current !== mine) return
    // 404 means this engine has no such concept — a different fact from
    // "you have written none", and the screen must not offer an editor for
    // a zone that does not exist.
    if (!result.ok) {
      if (result.status === 404) {
        setSupported(false)
        setRead(READY)
      } else {
        // A list already held stays; a failed first read or retry says so.
        setRead((current) =>
          current.status === 'ready' && held.current
            ? current
            : { status: 'failed', error: result.status === 0 ? say('The server is not responding') : result.error, httpStatus: result.status },
        )
      }
      return
    }
    held.current = true
    setFiles(result.data.files ?? [])
    setPlaces(result.data.paths ?? [])
    setRead(READY)
  }, [fetchImpl, say])

  /** Retry: the failure gives way to the wait, then to the list. */
  const retry = useCallback(() => {
    setRead(LOADING)
    void reload()
  }, [reload])

  useEffect(() => {
    void reload()
  }, [reload])

  /** A card for a file that is not on disk yet. */
  const announce = useCallback((path: string, kind: Kind) => {
    setFiles((current) =>
      current?.some((file) => file.path === path)
        ? current
        : [...(current ?? []), { path, modified: new Date().toISOString(), bytes: 0, kind }],
    )
  }, [])

  return { files, places, supported, read, retry, reload, announce }
}

/** The text of whatever the address names, seeded or fetched, and its save. */
export function useInstructionText(
  open: string | undefined,
  seed: Seed | undefined,
  onSaved: () => void,
  fetchImpl: typeof fetch,
  t: (key: string) => string,
) {
  const say = useLatest(t)
  const [text, setText] = useState('')
  /** What was loaded, so Save lights up on a real change rather than on focus. */
  const [onDisk, setOnDisk] = useState('')
  const [save, setSave] = useState<Save>({ kind: 'idle' })
  const [read, setRead] = useState<Read>(READY)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (open === undefined) return undefined
    setSave({ kind: 'idle' })
    if (seed?.path === open) {
      setRead(READY)
      setText(seed.text)
      // Not on disk yet, so anything typed is a change: Save lights up at the
      // first keystroke rather than waiting for a file that is not there.
      setOnDisk('')
      return undefined
    }
    let live = true
    setRead(LOADING)
    void (async () => {
      const result = await requestJson<{ markdown?: string }>(fetchImpl, fileUrl(open), undefined, say)
      if (!live) return
      if (!result.ok) {
        // Never an empty, editable box in place of a file that could not be read.
        setRead({ status: 'failed', error: result.status === 0 ? say('The server is not responding') : result.error, httpStatus: result.status })
        return
      }
      const markdown = result.data.markdown ?? ''
      setText(markdown)
      setOnDisk(markdown)
      setRead(READY)
    })()
    return () => {
      live = false
    }
  }, [fetchImpl, open, seed, say, attempt])

  const retry = useCallback(() => {
    setRead(LOADING)
    setAttempt((current) => current + 1)
  }, [])

  const commit = useCallback(async () => {
    if (!open) return
    setSave({ kind: 'saving' })
    const result = await requestJson(fetchImpl, fileUrl(open), jsonInit('PUT', { markdown: text }), say)
    if (!result.ok) {
      setSave({ kind: 'failed', message: result.error })
      return
    }
    setOnDisk(text)
    onSaved()
    setSave({ kind: 'saved' })
  }, [fetchImpl, open, text, onSaved, say])

  const edit = (next: string) => {
    setText(next)
    if (save.kind !== 'idle') setSave({ kind: 'idle' })
  }

  return { text, edit, dirty: text !== onDisk, save, commit, read, retry }
}
