import { Icon } from '../app/Icon.js'
import type { IconName } from '../app/icons.js'
import type { SaveState } from './useAutosave.js'

/** The save line: an icon and a sentence, in the page's language (`t` is identity in English). */
export function SaveStatus({ state, t = (key) => key }: { state: SaveState; t?: (key: string) => string }) {
  const line = (modifier: string, icon: IconName, text: string) => (
    <span className={modifier === '' ? 'adestia-save' : `adestia-save adestia-save--${modifier}`}>
      <Icon name={icon} {...(icon === 'loader-circle' ? { className: 'adestia-icon--spin' } : {})} />
      {text}
    </span>
  )
  switch (state.kind) {
    case 'idle':
      return null
    case 'saving':
      return line('', 'loader-circle', t('Saving…'))
    case 'saved':
      // Said out loud, because a silent reformat looks like the editor
      // mangled something the user did not touch.
      return line('ok', 'check', state.normalized ? t('Saved, tidied to house style') : t('Saved'))
    case 'conflict':
      return line('warn', 'triangle-alert', t('The agent changed this page. Reload to see its version.'))
    case 'rejected':
      return line(
        'error',
        'circle-alert',
        t('Not saved: %reason').replace('%reason', state.diagnostics[0]?.message ?? t('the page breaks the vocabulary')),
      )
    case 'failed':
      return line('error', 'circle-alert', state.message)
  }
}
