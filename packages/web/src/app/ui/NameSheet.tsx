import { useState, type FormEvent } from 'react'

import { Button } from './Button.js'
import { Field } from './Field.js'
import { Sheet } from './Sheet.js'

/** Why a name was refused: already used, or the write itself failed. */
export type NameRefusal = 'taken' | 'failed'

export interface NameSheetProps {
  readonly title: string
  readonly question: string
  /** The verb on the confirming button: Create, Rename. */
  readonly submitLabel: string
  readonly initial?: string
  /** Whether the typed name can be sent; absent means any non-empty one. */
  readonly accepts?: (name: string) => boolean
  /** Does the work (the sheet makes no network call itself); a refusal keeps the sheet open under the field. */
  readonly onSubmit: (name: string) => NameRefusal | undefined | Promise<NameRefusal | undefined>
  readonly onCancel: () => void
  readonly t: (key: string) => string
}

/**
 * One field in a small sheet (docs/charte.md § 4, name sheet): the confirm button waits
 * for a non-empty name, Enter confirms, Escape and Cancel close. A refusal shows under
 * the field with the alert icon; the typed name stays.
 */
export function NameSheet({ title, question, submitLabel, initial = '', accepts, onSubmit, onCancel, t }: NameSheetProps) {
  const [name, setName] = useState(initial)
  const [refusal, setRefusal] = useState<NameRefusal | undefined>()
  const [busy, setBusy] = useState(false)
  const sendable = name.trim() !== '' && (accepts ? accepts(name) : true)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!sendable || busy) return
    setBusy(true)
    try {
      setRefusal(await onSubmit(name))
    } catch {
      setRefusal('failed')
    } finally {
      setBusy(false)
    }
  }
  const error = refusal === 'taken' ? t('name already taken') : refusal === 'failed' ? t('Could not write the name. Try again.') : undefined
  return (
    <Sheet
      open
      title={title}
      onClose={onCancel}
      t={t}
      className="adestia-nameprompt"
      footer={
        <>
          <Button onClick={onCancel}>{t('Cancel')}</Button>
          <Button variant="accent" icon="plus" type="submit" form="adestia-nameprompt" disabled={!sendable || busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id="adestia-nameprompt" onSubmit={(event) => void submit(event)}>
        <Field label={question} {...(error ? { error } : {})}>
          <input
            className="adestia-input"
            value={name}
            autoComplete="off"
            data-autofocus
            onChange={(event) => { setName(event.target.value); setRefusal(undefined) }}
          />
        </Field>
      </form>
    </Sheet>
  )
}
