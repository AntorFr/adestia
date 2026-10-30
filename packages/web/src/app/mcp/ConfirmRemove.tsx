/**
 * E-33: the question asked before a server is removed. A `Sheet` with
 * `NamePrompt`'s footer shape. Cancel, the ✕, the scrim and Escape all end in
 * `onCancel`; only the Remove button calls `onConfirm`.
 */

import { Button, Sheet } from '../ui/index.js'

export interface ConfirmRemoveProps {
  readonly name: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
  readonly t: (key: string) => string
}

export function ConfirmRemove({ name, onConfirm, onCancel, t }: ConfirmRemoveProps) {
  // The name sits where the translation puts `%name`, set in strong and never cut.
  const [before = '', after = ''] = t('“%name” will no longer be wired. Its declaration is deleted from this instance.').split('%name')
  return (
    <Sheet
      open
      title={t('Remove server?')}
      onClose={onCancel}
      t={t}
      className="adestia-confirm"
      footer={
        <>
          <Button data-autofocus onClick={onCancel}>{t('Cancel')}</Button>
          <Button variant="danger" onClick={onConfirm}>{t('Remove')}</Button>
        </>
      }
    >
      <p className="adestia-confirm__body">
        {before}
        <strong className="adestia-confirm__name">{name}</strong>
        {after}
      </p>
    </Sheet>
  )
}
