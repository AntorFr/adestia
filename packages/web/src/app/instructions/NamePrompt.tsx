/**
 * Where a new skill or agent gets its name: a small sheet with one field.
 *
 * It replaces `window.prompt`, with the same rules: cancelling or sending an
 * empty name does nothing, and there is no validation state of its own — the
 * name is slugged downstream and an empty slug is simply not a name.
 */

import { useState, type FormEvent } from 'react'

import { Button, Field, Sheet } from '../ui/index.js'

export interface NamePromptProps {
  readonly question: string
  readonly onName: (name: string) => void
  readonly onCancel: () => void
  readonly t: (key: string) => string
}

export function NamePrompt({ question, onName, onCancel, t }: NamePromptProps) {
  const [name, setName] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() !== '') onName(name)
  }
  return (
    <Sheet
      open
      title={t('A name')}
      onClose={onCancel}
      t={t}
      className="adestia-nameprompt"
      footer={
        <>
          <Button onClick={onCancel}>{t('Cancel')}</Button>
          <Button variant="accent" icon="plus" type="submit" form="adestia-nameprompt" disabled={name.trim() === ''}>
            {t('Create')}
          </Button>
        </>
      }
    >
      <form id="adestia-nameprompt" onSubmit={submit}>
        <Field label={question}>
          <input
            className="adestia-input"
            value={name}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
      </form>
    </Sheet>
  )
}
