/** The zone as cards: grouped by when the engine reads them, searchable, with the ways to add one. */

import { useMemo, useState } from 'react'

import { Icon } from '../Icon.js'
import type { IconName } from '../icons.js'
import { Button, EmptyState } from '../ui/index.js'
import {
  GROUPS,
  KINDS,
  NEW,
  kindOf,
  matches,
  size,
  title,
  type InstructionFile,
  type InstructionPath,
  type Kind,
} from './model.js'

const KIND_ICON: Readonly<Record<Kind, IconName>> = {
  instruction: 'file-text',
  skill: 'sparkles',
  agent: 'users',
}

export interface InstructionListProps {
  readonly files: readonly InstructionFile[] | undefined
  readonly places: readonly InstructionPath[]
  readonly locale: string | undefined
  readonly onOpen: (path: string) => void
  /** A named file is created as itself. */
  readonly onStart: (path: string, kind: Kind) => void
  /** A folder takes a name first: the caller asks for it. */
  readonly onCreate: (place: InstructionPath, kind: Kind) => void
  readonly onCatalogues: () => void
  readonly t: (key: string) => string
}

function Card({ file, locale, onOpen, t }: Pick<InstructionListProps, 'locale' | 'onOpen' | 't'> & { file: InstructionFile }) {
  return (
    <li>
      <button type="button" className="adestia-filecard" onClick={() => onOpen(file.path)}>
        <span className="adestia-filecard__head">
          <Icon name={KIND_ICON[kindOf(file)]} />
          <span className="adestia-filecard__name">{title(file)}</span>
          {file.managed && (
            <span className="adestia-filecard__badge">
              <Icon name="lock" />
              {t('delivered')}
            </span>
          )}
        </span>
        {/* What it is FOR — the sentence its author wrote, and for a skill the
            very one the engine matches a task against. It is what tells two
            SKILL.md files apart before either is opened. */}
        {file.description && <span className="adestia-filecard__about">{file.description}</span>}
        {/* Only when it adds something: for a file at the workspace root the
            path IS the name, and printing both is noise. */}
        {file.path !== title(file) && <span className="adestia-filecard__path">{file.path}</span>}
        {/* Where an imported item came from. A plugin's file has no source. */}
        {file.source && (
          <span className="adestia-filecard__source" title={file.source.repo}>
            {file.source.catalogue} @ {file.source.ref}
          </span>
        )}
        <span className="adestia-filecard__foot">
          <span>{size(file.bytes)}</span>
          <span>{new Date(file.modified).toLocaleDateString(locale)}</span>
        </span>
      </button>
    </li>
  )
}

function Tools({ places, query, onQuery, onStart, onCreate, onCatalogues, t }: Pick<InstructionListProps, 'places' | 'onStart' | 'onCreate' | 'onCatalogues' | 't'> & { query: string; onQuery: (q: string) => void }) {
  /**
   * Folders, in the order the groups are drawn in — not the driver's
   * declaration order, which put `+ Agent` before `+ Skill` under a screen
   * listing skills before agents.
   */
  const folders = places
    .filter((place) => place.kind === 'folder')
    .slice()
    .sort((a, b) => KINDS.indexOf(a.holds ?? 'instruction') - KINDS.indexOf(b.holds ?? 'instruction'))
  return (
    <div className="adestia-instructions__tools">
      {/* Drawn from two files up: a field that appears at some threshold is a
          field nobody knows is there below it. */}
      <div className="adestia-instructions__searchbox">
        <Icon name="search" />
        <input
          type="search"
          className="adestia-input adestia-instructions__search"
          value={query}
          placeholder={t('Search instructions')}
          aria-label={t('Search instructions')}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      {/* Where a first instruction can be written. Without this the screen was
          a dead end on a fresh instance. The places come from the driver. */}
      {places
        .filter((place) => place.kind === 'file' && !place.exists)
        .map((place) => (
          <Button key={place.path} icon="file-text" onClick={() => onStart(place.path, place.holds ?? 'instruction')}>
            + {place.path}
          </Button>
        ))}
      <Button icon="book-open" onClick={onCatalogues}>
        {t('Catalogues')}
      </Button>
      {folders.map((place) => {
        const holds = place.holds ?? 'instruction'
        // Codex declares TWO skill folders: the path joins the label when, and
        // only when, it is what tells them apart. In ONE string rather than a
        // styled span beside it: a name split across elements is read back
        // without the space between them.
        const ambiguous = folders.filter((other) => (other.holds ?? 'instruction') === holds)
        return (
          <Button key={place.path} icon={KIND_ICON[holds]} onClick={() => onCreate(place, holds)}>
            {ambiguous.length > 1 ? `+ ${t(NEW[holds].label)} · ${place.path}` : `+ ${t(NEW[holds].label)}`}
          </Button>
        )
      })}
    </div>
  )
}

export function InstructionList(props: InstructionListProps) {
  const { files, locale, onOpen, t } = props
  const [query, setQuery] = useState('')
  /** Only the groups that have something in them, in their settled order. */
  const groups = useMemo(() => {
    const found = (files ?? []).filter((file) => matches(file, query))
    return KINDS.map((kind) => ({ kind, files: found.filter((file) => kindOf(file) === kind) })).filter(
      (group) => group.files.length > 0,
    )
  }, [files, query])

  return (
    <div className="adestia-instructions">
      <header
        className="adestia-chead"
        style={{ '--tile-color': 'var(--adestia-hue-bleu, var(--accent))' } as Record<string, string>}
      >
        <span className="adestia-chead__icon" aria-hidden="true">
          <Icon name="book-open" />
        </span>
        <div>
          <h1 className="adestia-chead__title">{t('Instructions')}</h1>
          <p className="adestia-chead__lede">
            {t('What you have told the agent, in your words. Saved exactly as typed.')}
          </p>
        </div>
      </header>

      <Tools {...props} query={query} onQuery={setQuery} />

      {files !== undefined && files.length === 0 && (
        <EmptyState icon="book-open" text={t('Nothing here yet — write one, or ask the agent to.')} />
      )}
      {files !== undefined && files.length > 0 && groups.length === 0 && (
        <EmptyState icon="search" text={t('Nothing matches that.')} />
      )}

      {groups.map((group) => (
        <section key={group.kind} className="adestia-igroup">
          {/* A lone group repeats the screen's own title and says nothing — it
              earns its heading only once there is something to tell it apart. */}
          {groups.length > 1 && (
            <header className="adestia-igroup__head">
              <h2 className="adestia-igroup__title">{t(GROUPS[group.kind].title)}</h2>
              <p className="adestia-igroup__lede">{t(GROUPS[group.kind].lede)}</p>
            </header>
          )}
          <ul className="adestia-filecards">
            {group.files.map((file) => (
              <Card key={file.path} file={file} locale={locale} onOpen={onOpen} t={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
