/** The restart, offered only once something is actually waiting on one. */

import { Icon } from '../Icon.js'
import type { IconName } from '../icons.js'
import { Button } from '../ui/index.js'
import type { RestartState } from './model.js'

/** Every state of the band names itself with an icon as well as words. */
function iconOf(restart: RestartState): IconName {
  if (restart.kind === 'blocked') return 'triangle-alert'
  if (restart.kind === 'failed') return 'circle-alert'
  if (restart.kind === 'asking' || restart.kind === 'waiting') return 'loader-circle'
  return 'rotate-ccw'
}

/**
 * It is not a quit button: the server closes its instance and starts a new
 * one in the same process, so what runs it — a container, a pod, a terminal —
 * never notices.
 */
export function RestartBar({
  restart,
  onRestart,
  t,
}: {
  readonly restart: RestartState
  readonly onRestart: (force: boolean) => void
  readonly t: (key: string) => string
}) {
  const working = restart.kind === 'asking' || restart.kind === 'waiting'
  return (
    <div className="adestia-config__restart-bar" role="group">
      <p className="adestia-config__restart-line">
        <Icon name={iconOf(restart)} {...(working ? { className: 'adestia-icon--spin' } : {})} />
        <span>
          <strong>{t('Saved, and waiting for a restart.')}</strong>{' '}
          {t('The instance is still running the values it booted with.')}
        </span>
      </p>

      {restart.kind === 'blocked' && (
        <p className="adestia-save adestia-save--error adestia-config__restart-line" role="alert">
          <Icon name="triangle-alert" />
          {t('%n turn(s) running — restarting now would lose that work.').replace('%n', String(restart.running))}
        </p>
      )}
      {restart.kind === 'failed' && (
        <p className="adestia-save adestia-save--error adestia-config__restart-line" role="alert">
          <Icon name="circle-alert" />
          {restart.message}
        </p>
      )}

      <Button
        variant="danger"
        icon="refresh-cw"
        busy={working}
        onClick={() => onRestart(restart.kind === 'blocked')}
        disabled={working}
      >
        {restart.kind === 'waiting'
          ? t('Coming back…')
          : restart.kind === 'blocked'
            ? t('Restart anyway')
            : t('Restart now')}
      </Button>
    </div>
  )
}
