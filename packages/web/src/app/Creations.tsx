/** The create list (E-37): rows of action in a sheet, and the same rows as buttons for the empty states. */

import { Icon } from './Icon.js'
import { needsCaption, type Creation } from './creations.js'
import { Sheet } from './ui/index.js'

interface RowsProps {
  readonly creations: readonly Creation[]
  readonly onChoose: (creation: Creation) => void
  readonly t: (key: string) => string
}

function Rows({ creations, onChoose, t }: RowsProps) {
  return (
    <>
      {creations.map((creation) => (
        <button key={`${creation.plugin ?? 'core'}/${creation.id}`} type="button" className="adestia-action-row" onClick={() => onChoose(creation)}>
          <Icon name={creation.icon ?? 'plus'} className="adestia-action-row__icon" />
          <span className="adestia-action-row__label">{t(creation.label)}</span>
          {needsCaption(creation, creations) ? <span className="adestia-action-row__line">{creation.plugin}</span> : null}
          <span className="adestia-action-row__line">{t(creation.line)}</span>
        </button>
      ))}
    </>
  )
}

export interface CreationsProps extends RowsProps {
  readonly onClose: () => void
}

/** The list sheet: choosing a row closes the sheet, then acts. */
export function Creations({ creations, onChoose, onClose, t }: CreationsProps) {
  return (
    <Sheet open title={t('Create')} onClose={onClose} t={t} className="adestia-creations">
      <div className="adestia-creations__rows">
        <Rows
          creations={creations}
          t={t}
          onChoose={(creation) => { onClose(); onChoose(creation) }}
        />
      </div>
    </Sheet>
  )
}

/** The same rows, one `<button>` each, for an empty home or folder. */
export function CreationButtons({ creations, onChoose, t }: RowsProps) {
  return (
    <div className="adestia-creations__rows">
      <Rows creations={creations} onChoose={onChoose} t={t} />
    </div>
  )
}
