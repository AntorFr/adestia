/**
 * The front page: the agent's curated brief, its age and its refresh.
 *
 * It lives as long as the landing canvas does and owns the one request that
 * feeds it, so the rest of the home never learns the brief's shape.
 */

import { useEffect, useState } from 'react'

import type { LoadedPlugin } from '../plugins/loader.js'
import type { Skin } from './skin.js'
import { requestJson } from './request.js'
import { routeForPath } from './owners.js'

/**
 * One entry of the curated brief.
 *
 * The predecessor's field names are accepted alongside the plain ones
 * (`titre`/`title`, `raison`/`reason`, `cible`/`target`): the file is written
 * by an agent following whatever contract its instance carries, and a rename
 * should never blank a working front page.
 */
interface BriefItem {
  readonly ico?: string
  readonly title?: string
  readonly titre?: string
  readonly reason?: string
  readonly raison?: string
  readonly target?: BriefTarget
  readonly cible?: BriefTarget
}

interface BriefTarget {
  readonly type?: string
  readonly path?: string
  readonly id?: string
}

interface BriefDocument {
  readonly generatedAt?: string
  readonly items?: readonly BriefItem[]
}

/** How old the brief is, said the way a person would. */
function briefAge(
  generatedAt: string | undefined,
  now: Date,
  t: (key: string) => string,
): string | undefined {
  if (!generatedAt) return undefined
  const hours = Math.round((now.getTime() - new Date(generatedAt).getTime()) / 3_600_000)
  if (!Number.isFinite(hours) || hours < 0) return undefined
  if (hours < 1) return t('just now')
  if (hours < 24) return `${t('%n h ago').replace('%n', String(hours))}`
  return `${t('%n d ago').replace('%n', String(Math.round(hours / 24)))}`
}

/** The hue a target's kind wears — the predecessor's mapping, in named hues. */
const BRIEF_HUES: Readonly<Record<string, string>> = {
  workbook: 'emeraude',
  fiche: 'bleu',
  page: 'bleu',
  domaine: 'indigo',
  section: 'indigo',
  todo: 'rouge',
  app: 'rouge',
}

/** Fetches the brief. No brief is a home without that section, never an error. */
function useBrief(fetchImpl: typeof fetch | undefined): BriefDocument | undefined {
  const [brief, setBrief] = useState<BriefDocument | undefined>(undefined)

  useEffect(() => {
    let live = true
    // No brief is a home without that section, never an error: a failure is silent.
    void requestJson<BriefDocument>(fetchImpl ?? globalThis.fetch, '/api/home/brief').then(
      (result) => {
        if (live && result.ok && result.data?.items?.length) setBrief(result.data)
      },
    )
    return () => {
      live = false
    }
  }, [fetchImpl])

  return brief
}

export function Brief({
  skin,
  plugins,
  clock,
  fetchImpl,
  openPlugin,
  openSection,
  openPage,
  ask,
  t,
}: {
  readonly skin: Skin
  readonly plugins: readonly LoadedPlugin[]
  readonly clock: Date
  readonly fetchImpl: typeof fetch | undefined
  readonly openPlugin: (plugin: LoadedPlugin) => void
  readonly openSection: (path: string) => void
  readonly openPage: (path: string) => void
  /** Sends a prompt to the agent — the refresh button and the fallback use it. */
  readonly ask: ((prompt: string) => void) | undefined
  readonly t: (key: string) => string
}) {
  const brief = useBrief(fetchImpl)

  /** Where a brief entry leads. Unknown kinds fall back to the composer. */
  const openTarget = (target: BriefTarget | undefined, label: string) => {
    const kind = target?.type
    if ((kind === 'app' || kind === 'todo') && plugins.length > 0) {
      const wanted = target?.id ?? (kind === 'todo' ? 'todo' : undefined)
      const found = plugins.find((entry) => entry.id === wanted)
      if (found) {
        // An app named WITH a path opens on that path — "the bench, on the
        // garage job" rather than "the bench". Asked of that app alone: a
        // named target is an instruction, not a question.
        const inside = target?.path ? routeForPath([found], target.path) : undefined
        if (inside) {
          location.hash = inside
          return
        }
        return openPlugin(found)
      }
    }
    if ((kind === 'fiche' || kind === 'page') && target?.path) {
      return openPage(target.path.replace(/\.md$/, '') + '.md')
    }
    if ((kind === 'domaine' || kind === 'section') && target?.path) return openSection(target.path)
    // Any other path goes to whoever owns it — no `type` the shell has to
    // learn, no plugin's URL shape written down here. `workbook` used to be
    // spelled out at this spot, atelier route and all, which meant the shell
    // knew one plugin by name and every future one would have needed its own
    // line. A brief written that way still works, and now for the right
    // reason: the atelier claims the path, the shell merely asks.
    if (target?.path) {
      const owned = routeForPath(plugins, target.path)
      if (owned) {
        location.hash = owned
        return
      }
    }
    // The truthful fallback: let the person ask about it.
    ask?.(`Ouvre « ${label} »`)
  }

  if (!brief) return null

  return (
    <>
      <h2 className="adestia-section">
        À la une
        {(() => {
          const age = briefAge(brief.generatedAt, clock, t)
          const by = skin.brand ?? t('the agent')
          return (
            <span className="adestia-section__by">
              — {t('chosen by')} {by}
              {age ? ` · ${age}` : ''}
            </span>
          )
        })()}
        {ask && (
          <button
            type="button"
            className="adestia-section__refresh"
            title={t('Ask for a fresh brief')}
            onClick={() => ask('Rafraîchis ma une')}
          >
            ↺
          </button>
        )}
      </h2>
      <div className="adestia-brief">
        {(brief.items ?? []).slice(0, 4).map((item) => {
          const label = item.title ?? item.titre ?? '…'
          const target = item.target ?? item.cible
          const hue = BRIEF_HUES[target?.type ?? '']
          return (
            <button
              key={label}
              type="button"
              className="adestia-brief__item"
              style={(hue ? { '--u': `var(--adestia-hue-${hue}, var(--accent))` } : {}) as Record<string, string>}
              title={item.reason ?? item.raison ?? ''}
              onClick={() => openTarget(target, label)}
            >
              <span className="adestia-brief__icon" aria-hidden="true">
                {item.ico ?? '•'}
              </span>
              <span className="adestia-brief__text">{label}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
