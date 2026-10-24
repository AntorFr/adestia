/** One instruction, open: what it is, and its text — editable unless the product delivers it. */

import { Icon } from '../Icon.js'
import { Button } from '../ui/index.js'
import { GROUPS, kindOf, label, title, type InstructionFile } from './model.js'
import type { Save } from './useInstructions.js'

export interface InstructionEditorProps {
  readonly open: string
  readonly shown: InstructionFile | undefined
  readonly text: string
  readonly dirty: boolean
  readonly save: Save
  readonly onEdit: (text: string) => void
  readonly onSave: () => void
  readonly t: (key: string) => string
}

export function InstructionEditor({ open, shown, text, dirty, save, onEdit, onSave, t }: InstructionEditorProps) {
  const managed = shown?.managed === true
  const name = shown ? title(shown) : label(open)
  return (
    <section className="adestia-instructions">
      {/* No back button of its own: the shell draws one, and it climbs one
          level. Two of them stacked is what this screen shipped with. */}
      <header className="adestia-chead">
        <span className="adestia-chead__icon" aria-hidden="true">
          <Icon name="book-open" />
        </span>
        <div>
          <h1 className="adestia-chead__title">{name}</h1>
          {/* What it is, and therefore when the engine reads it — said here
              because somebody arriving by a link never saw the card that
              would have told them. */}
          <p className="adestia-chead__lede">{t(GROUPS[shown ? kindOf(shown) : 'instruction'].lede)}</p>
          {/* The address, only when it adds something: for a file at the
              workspace root the path IS the name. Same rule as the card. */}
          {open !== name && (
            <p className="adestia-instructions__where">
              <code>{open}</code>
            </p>
          )}
        </div>
      </header>

      {managed && (
        <p className="adestia-instructions__delivered">
          <Icon name="lock" />
          {t('Delivered with the product and rewritten at every start — shown, not edited.')}
        </p>
      )}

      <div className="adestia-instructions__pane">
        {!managed && (
          <div className="adestia-instructions__bar">
            <span style={{ flex: 1 }} />
            {save.kind === 'failed' && (
              <span className="adestia-save adestia-save--error" role="alert">
                <Icon name="circle-alert" />
                {save.message}
              </span>
            )}
            {save.kind === 'saved' && !dirty && <span className="adestia-save">{t('Saved')}</span>}
            <Button
              variant="accent"
              icon="save"
              onClick={onSave}
              disabled={!dirty || save.kind === 'saving'}
              busy={save.kind === 'saving'}
            >
              {save.kind === 'saving' ? t('Saving…') : t('Save')}
            </Button>
          </div>
        )}
        <textarea
          className="adestia-textarea adestia-instructions__text"
          value={text}
          spellCheck={false}
          readOnly={managed}
          aria-label={name}
          onChange={(event) => onEdit(event.target.value)}
        />
      </div>
    </section>
  )
}
