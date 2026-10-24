/** The tab and list share one state vocabulary, announced as well as drawn. */
import type { TabDot } from './tabs.js'

const LABELS: Record<TabDot, string> = { idle: 'Idle', working: 'Working', waiting: 'Waiting', unread: 'Unread' }

export function StatusDot({ state, t }: { state: TabDot; t: (key: string) => string }) {
  return <span className={`adestia-dot adestia-dot--${state}`} role="img" aria-label={t(LABELS[state])} title={t(LABELS[state])} />
}
