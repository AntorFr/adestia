/**
 * The composer: the field, its attachments, and the controls around it —
 * in a row when there is room, folded under one button when there is not.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { Icon } from '../app/Icon.js'
import { requestRaw } from '../app/request.js'
import { useMobile } from '../app/useMobile.js'
// The drag primitive is shared with the page screen: one answer to "is this
// drag carrying files", so the two surfaces cannot disagree about it.
import { carriesFiles } from '../editor/filedrop.js'

/** A composer button a plugin added. */
export interface ComposerButton {
  readonly key: string
  readonly glyph: string
  readonly title: string
  readonly api: unknown
  onClick(api: unknown): void
}

/**
 * The composer's secondary controls, folded under one button.
 *
 * On a phone the composer had grown a row of peers — clip, model, one glyph
 * per plugin, send — and the field they surround is the only one of them
 * anybody came to use. Every extra button takes its width from the text.
 *
 * So they fold: one `+` opens them as a menu, which is the gesture every
 * messaging app on the device already taught. Nothing is removed and nothing
 * is hidden behind a guess — the menu names each action in words rather than
 * asking the reader to decode a glyph, which the inline row never did either.
 * Wide enough to lay them out, the row comes back; this is a fold, not a
 * second navigation.
 */
export function ComposerFold({
  onPick,
  buttons,
  t = (key) => key,
}: {
  onPick: () => void
  buttons: readonly ComposerButton[]
  t?: (key: string) => string
}) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    // Escape and a click outside, because a menu that only closes by
    // reopening it is a menu that covers the field it belongs to.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onDown = (event: MouseEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div className="adestia-fold" ref={host}>
      <button
        type="button"
        className="adestia-composer__attach adestia-btn adestia-btn--icon"
        aria-label={t('More')}
        title={t('More')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="plus" />
      </button>
      {open && (
        <div className="adestia-fold__menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="adestia-fold__item"
            onClick={() => {
              setOpen(false)
              onPick()
            }}
          >
            <span className="adestia-fold__glyph" aria-hidden="true">
              <Icon name="paperclip" />
            </span>
            {t('Attach files')}
          </button>
          {/* Same declarative data the inline row draws — a glyph and a
              title, never markup a plugin supplied. */}
          {buttons.map((button) => (
            <button
              key={button.key}
              type="button"
              role="menuitem"
              className="adestia-fold__item"
              onClick={() => {
                setOpen(false)
                button.onClick(button.api)
              }}
            >
              <span className="adestia-fold__glyph" aria-hidden="true">
                {button.glyph}
              </span>
              {button.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * How tall the field stands, in pixels.
 *
 * A floor as well as a ceiling, and the floor is the fix: `rows={1}` left a
 * 34px slot that read as a search box on a surface whose whole purpose is
 * writing to somebody. Two lines' worth at rest says "type here, at length".
 * The ceiling stops a pasted essay from eating the transcript — past it the
 * field scrolls, which is why it is a max and not a cap on what you may say.
 */
export const COMPOSER_MIN_HEIGHT = 48

export const COMPOSER_MAX_HEIGHT = 200

export function composerHeight(scrollHeight: number): number {
  return Math.min(Math.max(scrollHeight, COMPOSER_MIN_HEIGHT), COMPOSER_MAX_HEIGHT)
}

/** Grows the field to its text, or to its placeholder when empty. */
function useFittedField(area: RefObject<HTMLTextAreaElement | null>, text: string, placeholder: string | undefined): void {
  const fit = useCallback(() => {
    const element = area.current
    if (!element) return
    // Measured from scratch each time: `scrollHeight` on an element that
    // still carries its previous height reports that height, so a field that
    // grew would never shrink back when the text was deleted.
    element.style.height = 'auto'
    // An empty field reports the height of nothing, not of its placeholder:
    // on a narrow phone the placeholder wraps to a second line and would be
    // cut. So the empty field is measured with the placeholder standing in
    // for the text, then put back before anything paints.
    const empty = element.value === ''
    if (empty) element.value = element.placeholder
    const content = element.scrollHeight
    if (empty) element.value = ''
    // scrollHeight leaves the border out and the field is border-box.
    const border = element.offsetHeight - element.clientHeight
    const height = composerHeight(content + border)
    element.style.height = `${height}px`
    // Only once it has stopped growing, or the scrollbar flickers in and out
    // on every keystroke of an ordinary two-line message.
    element.style.overflowY = content + border > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [area])

  // Re-fitted when the words change and when the field's width does (a phone
  // turned, a window resized): the placeholder wraps with the width.
  useEffect(fit, [fit, text, placeholder])
  useEffect(() => {
    const element = area.current
    if (!element || typeof ResizeObserver === 'undefined') return
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth
        fit()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [area, fit])
}

export interface PendingAttachment {
  readonly id: string
  readonly name: string
}

/**
 * What a composer has taken in: the files waiting in its tray, the refusal
 * under them, and the uploader that fills both. The send empties the tray, so
 * the setter is handed out with the list rather than kept private.
 */
function useUploads(fetchImpl: typeof fetch, t: (key: string) => string) {
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([])
  const [uploadError, setUploadError] = useState<string | undefined>()

  const upload = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return
      setUploadError(undefined)
      const form = new FormData()
      for (const file of files) form.append('file', file)

      const sent = await requestRaw(fetchImpl, '/api/upload', { method: 'POST', body: form }, t)
      // Only an unreachable server takes the translated fallback; the server's
      // own `error` and the list of refusals keep their way.
      if (!sent.ok) {
        setUploadError(sent.error)
        return
      }
      const { response } = sent
      try {
        const body = (await response.json()) as {
          attachments?: PendingAttachment[]
          refused?: string[]
          error?: string
        }
        if (!response.ok) {
          setUploadError(body.error ?? `upload failed (${response.status})`)
          return
        }
        setAttachments((current) => [...current, ...(body.attachments ?? [])])
        // Refusals are shown next to what worked: a file silently dropped is a
        // file the user believes the agent has.
        if (body.refused?.length) setUploadError(body.refused.join('; '))
      } catch (error) {
        setUploadError((error as Error).message)
      }
    },
    [fetchImpl, t],
  )

  return { attachments, setAttachments, uploadError, upload }
}

export function Composer({
  onSend,
  onStop,
  busy,
  stopping,
  blocked,
  placeholder,
  sendIcon,
  fetchImpl = fetch,
  extraButtons,
  onFill,
  onAttach,
  folded,
  t = (key) => key,
}: {
  onSend: (text: string, attachments: readonly PendingAttachment[]) => void
  onStop: () => void
  busy: boolean
  /** The stop was taken and the engine has not landed yet: the stop button is spent. */
  stopping?: boolean
  /** A question is on screen: the turn is waiting on it, not on more text. */
  blocked?: boolean
  placeholder?: string
  /** The livery's send glyph, as SVG markup (see skin.ts). */
  sendIcon?: string
  fetchImpl?: typeof fetch
  extraButtons?: readonly ComposerButton[]
  onFill?: (fill: (text: string) => void) => void
  /**
   * Publishes the composer's uploader, so a screen elsewhere can hand it
   * files. The chat is where an attachment belongs — the tray, the refusals
   * and the send are already here — and a second uploader would be a second
   * place for a file to get lost.
   */
  onAttach?: (attach: (files: readonly File[]) => Promise<void>) => void
  /**
   * Fold the secondary controls under one button.
   *
   * Defaults to whatever the viewport says, and is a prop so a test — or a
   * skin that folds early — can state it outright rather than driving a
   * media query to get there.
   */
  folded?: boolean
  t?: (key: string) => string
}) {
  const narrow = useMobile()
  // The prop wins when given: a caller who states it means it, and the hook
  // still runs so the answer stays live when nobody does.
  const fold = folded ?? narrow
  const [text, setText] = useState('')
  const [dropping, setDropping] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const { attachments, setAttachments, uploadError, upload } = useUploads(fetchImpl, t)

  const submit = useCallback(() => {
    const value = text.trim()
    // A message may be files only: dropping a photo and saying nothing is a
    // complete request.
    if ((!value && attachments.length === 0) || blocked) return
    onSend(value, attachments)
    setText('')
    setAttachments([])
  }, [attachments, blocked, onSend, setAttachments, text])

  useEffect(() => {
    // Appends rather than replaces: whatever the user already typed IS the
    // instruction, and a plugin dropping text must not erase it.
    onFill?.((text: string) => {
      // An empty fill is also the home's focus command. Leave the draft
      // untouched, including when a plugin's scanner found no code.
      area.current?.focus()
      if (text.trim() === '') return
      setText((current) => (current.trim() === '' ? text : `${current.trimEnd()} ${text}`))
    })
  }, [onFill])

  useEffect(() => {
    onAttach?.(upload)
  }, [onAttach, upload])

  useFittedField(area, text, placeholder)

  return (
    <form
      className={[
        'adestia-composer',
        dropping && 'adestia-composer--dropping',
        busy && 'adestia-composer--busy',
        stopping && 'adestia-composer--stopping',
        blocked && 'adestia-composer--blocked',
      ]
        .filter(Boolean)
        .join(' ')}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      // Dropping a file on the chat is the same gesture as picking one or
      // pasting one, and without these handlers the browser does the worst
      // possible thing with it: it leaves the conversation to display the file.
      onDragOver={(event) => {
        if (!carriesFiles(event.dataTransfer)) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        if (!carriesFiles(event.dataTransfer)) return
        event.preventDefault()
        setDropping(false)
        void upload([...event.dataTransfer.files])
      }}
    >
      <AttachmentTray
        attachments={attachments}
        {...(uploadError ? { error: uploadError } : {})}
        t={t}
        onRemove={(id) => setAttachments((current) => current.filter((a) => a.id !== id))}
      />
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          void upload([...(event.target.files ?? [])])
          event.target.value = ''
        }}
      />
      {/* Rendered BY THE SHELL from declarative data, never as markup a plugin
          supplied: a button is a glyph and a title, and injected HTML here
          would be injected into the one surface every user touches. Folded or
          in a row, the data is the same and only the layout differs. */}
      {fold ? (
        <ComposerFold
          onPick={() => picker.current?.click()}
          buttons={extraButtons ?? []}
          t={t}
        />
      ) : (
        <>
          <button
            type="button"
            className="adestia-composer__attach adestia-btn adestia-btn--icon"
            onClick={() => picker.current?.click()}
            aria-label={t('Attach files')}
            title={t('Attach files')}
          >
            <Icon name="paperclip" />
          </button>
          {extraButtons?.map((button) => (
            <button
              key={button.key}
              type="button"
              className="adestia-composer__attach adestia-btn adestia-btn--icon"
              onClick={() => button.onClick(button.api)}
              aria-label={button.title}
              title={button.title}
            >
              {button.glyph}
            </button>
          ))}
        </>
      )}
      <textarea
        ref={area}
        className="adestia-composer__input"
        aria-label={placeholder ?? t('Ask the agent…')}
        value={text}
        placeholder={placeholder ?? t('Ask the agent…')}
        rows={1}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        onPaste={(event) => {
          // Pasting an image is the same gesture as attaching one; gating it
          // behind the button would make a natural action fail silently.
          const files = [...event.clipboardData.files]
          if (files.length > 0) {
            event.preventDefault()
            void upload(files)
          }
        }}
      />
      {/* One button, two jobs: stop while a turn runs and the field is empty,
          send otherwise. Two buttons would put "stop" next to "send" for a
          user who is trying to queue a message. */}
      {busy && text.trim() === '' ? (
        <button
          type="button"
          className="adestia-composer__stop adestia-btn adestia-btn--danger adestia-btn--icon"
          onClick={onStop}
          disabled={stopping ?? false}
          aria-label={t('Stop')}
          title={t('Stop')}
        >
          <Icon name="square" />
        </button>
      ) : (
        <button
          type="submit"
          className="adestia-composer__send adestia-btn adestia-btn--icon"
          disabled={(text.trim() === '' && attachments.length === 0) || blocked}
          aria-label={t('Send')}
          title={t('Send')}
        >
          {/* The livery's glyph comes from the skin MODULE, code the
              instance already runs — inlining it adds no reach. */}
          {sendIcon ? (
            <span
              className="adestia-composer__glyph"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: sendIcon }}
            />
          ) : (
            <Icon name="arrow-up" />
          )}
        </button>
      )}
    </form>
  )
}

function AttachmentTray({
  attachments,
  error,
  t,
  onRemove,
}: {
  attachments: readonly PendingAttachment[]
  error?: string | undefined
  t: (key: string) => string
  onRemove: (id: string) => void
}) {
  if (attachments.length === 0 && !error) return null
  return (
    <div className="adestia-attachments">
      {attachments.map((attachment) => (
        <span key={attachment.id} className="adestia-attachments__item">
          {attachment.name}
          <button
            type="button"
            onClick={() => onRemove(attachment.id)}
            aria-label={t('Remove %name').replace('%name', attachment.name)}
            title={t('Remove %name').replace('%name', attachment.name)}
          >
            <Icon name="x" />
          </button>
        </span>
      ))}
      {error && (
        <p className="adestia-field__error adestia-attachments__error" role="alert">
          <Icon name="circle-alert" />
          {error}
        </p>
      )}
    </div>
  )
}
