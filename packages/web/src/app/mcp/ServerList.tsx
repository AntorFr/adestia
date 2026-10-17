/** The servers this instance reaches, as tiles, and the tile that adds one. */

import type { McpServerView } from '@antorfr/adestia-schemas'

import { Icon } from '../Icon.js'
import { Tile } from '../Tile.js'
import { EmptyState } from '../ui/index.js'
import type { McpServerHealth } from '../Settings.js'
import { stateOf } from './health.js'

export function ServerList({
  views,
  health,
  onOpen,
  onAdd,
  t,
}: {
  readonly views: readonly McpServerView[] | undefined
  readonly health: readonly McpServerHealth[] | undefined
  readonly onOpen: (name: string) => void
  readonly onAdd: () => void
  readonly t: (key: string) => string
}) {
  return (
    <div className="adestia-prefs adestia-prefs__page">
      <header
        className="adestia-chead"
        style={{ '--tile-color': 'var(--adestia-hue-indigo, var(--accent))' } as Record<string, string>}
      >
        <span className="adestia-chead__icon" aria-hidden="true">
          <Icon name="plug" />
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('MCP servers')}</h1>
          <p className="adestia-chead__lede">
            {t('What this instance reaches, and what it is doing about it')}
          </p>
        </div>
      </header>

      {views !== undefined && views.length === 0 && (
        <EmptyState icon="plug" text={t('None wired yet — add one, or declare it in the configuration file.')} />
      )}

      <ul className="adestia-tiles">
        {(views ?? []).map((view) => {
          const state = health?.find((entry) => entry.name === view.name)
          const tone = stateOf(state?.state)
          return (
            <Tile
              key={view.name}
              iconName="plug"
              hue={view.source === 'ui' ? 'indigo' : 'ardoise'}
              label={view.name}
              subtitle={view.transport === 'http' ? t('over HTTP') : t('a local process')}
              chips={[
                ...(tone
                  ? [
                      {
                        text: t(tone.label),
                        icon: tone.icon,
                        hot: state?.state === 'failed' || state?.state === 'needs-auth',
                      },
                    ]
                  : []),
                ...(view.editable ? [] : [{ text: t('read-only'), icon: 'lock' as const }]),
              ]}
              onOpen={() => onOpen(view.name)}
              t={t}
            />
          )
        })}
        <Tile
          key="+"
          iconName="plus"
          hue="indigo"
          label={t('Add a server')}
          subtitle={t('stdio or HTTP')}
          onOpen={onAdd}
          t={t}
        />
      </ul>
    </div>
  )
}
