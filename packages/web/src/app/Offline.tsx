/**
 * The offline banner (E-32, AD-22): the server does not answer.
 *
 * It states a fact and leaves by itself when the server answers; the screen
 * under it stays usable. Drawn by `App` in one place at a time.
 */

import { Icon } from './Icon.js'

export function Offline({ t }: { readonly t: (key: string) => string }) {
  return (
    <div className="adestia-offline" role="status">
      <Icon name="wifi-off" />
      <span>{t('The server is not responding')}</span>
    </div>
  )
}
