/**
 * Where a new skill or agent gets its name: the shared name sheet (`ui/NameSheet`)
 * with the same rules as `window.prompt` — cancelling or sending an empty name does
 * nothing, and there is no validation state of its own: the name is slugged
 * downstream and an empty slug is simply not a name.
 */

import { NameSheet } from '../ui/index.js'

export interface NamePromptProps {
  readonly question: string
  readonly onName: (name: string) => void
  readonly onCancel: () => void
  readonly t: (key: string) => string
}

export function NamePrompt({ question, onName, onCancel, t }: NamePromptProps) {
  return (
    <NameSheet
      title={t('A name')}
      question={question}
      submitLabel={t('Create')}
      onSubmit={(name) => { onName(name); return undefined }}
      onCancel={onCancel}
      t={t}
    />
  )
}
