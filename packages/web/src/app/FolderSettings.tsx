/**
 * Folder settings (E-39, B-39/B-40): the control in the header of E-3 and the sheet it opens.
 *
 * The sheet writes the settings file through `PUT /api/folders/settings`, with the
 * `revision` read in the index; nobody edits the file by hand. The sheet owns no state of
 * the index: it reads its entry from the props and asks the shell to read the index again.
 */

import { useState } from 'react'

import type { FolderSettings as Settings, FolderSettingsEntry } from '@antorfr/adestia-schemas'

import { ICON_NAMES, type IconName } from './icons.js'
import { jsonInit, requestJson } from './request.js'
import { type IndexEntry } from './sections.js'
import { Button, Field, HUE_NAMES, HuePicker, IconPicker, Loading, SettingRow, Sheet, type HueName } from './ui/index.js'

/** The hue names the sheet says aloud (never a hex value). */
const HUE_LABELS: Record<HueName, string> = {
  rouge: 'Red', orange: 'Orange', ambre: 'Amber', vert: 'Green', emeraude: 'Emerald', turquoise: 'Turquoise',
  bleu: 'Blue', indigo: 'Indigo', violet: 'Violet', rose: 'Pink', gris: 'Grey', ardoise: 'Slate',
}

const iconOf = (value: string | undefined): IconName | null =>
  (ICON_NAMES as readonly string[]).includes(value ?? '') ? (value as IconName) : null
const hueOf = (value: string | undefined): HueName | null =>
  (HUE_NAMES as readonly string[]).includes(value ?? '') ? (value as HueName) : null

export interface FolderSettingsProps {
  readonly section: string
  /** The folder's entry of the index (`folderSettings[section]`), absent when it has no file yet. */
  readonly entry?: FolderSettingsEntry
  readonly pages: readonly IndexEntry[]
  /** The name of the plugin screen the folder declares through `app:`, when it does. */
  readonly appName?: string
  /** The index has not answered yet: the fields wait. */
  readonly loading?: boolean
  readonly offline?: boolean
  readonly fetchImpl?: typeof fetch
  /** Read the index again, after a write or when the user reloads a conflict. */
  readonly refreshIndex?: () => Promise<void>
  readonly t: (key: string) => string
}

/** The button of the E-3 header; its label stays the accessible name when the word folds away. */
export function FolderSettings(props: FolderSettingsProps) {
  const [open, setOpen] = useState(false)
  const { t } = props
  return (
    <>
      <Button icon="settings" className="adestia-btn--fold" aria-label={t('Folder settings')} title={t('Folder settings')} onClick={() => setOpen(true)}>
        <span className="adestia-btn__word">{t('Folder settings')}</span>
      </Button>
      {open ? <FolderSettingsSheet {...props} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

type Failure = 'refused' | 'forbidden' | 'conflict' | undefined

function FolderSettingsSheet({ onClose, ...props }: FolderSettingsProps & { readonly onClose: () => void }) {
  // The form is keyed by the revision it was read at: a reload after a conflict mounts it afresh.
  const [reloads, setReloads] = useState(0)
  return <Form key={`${props.entry?.revision ?? ''}:${reloads}`} {...props} onClose={onClose} onReload={() => setReloads((n) => n + 1)} />
}

function Form({
  section, entry, pages, appName, loading, offline, fetchImpl = (...args) => fetch(...args), refreshIndex, t, onClose, onReload,
}: FolderSettingsProps & { readonly onClose: () => void; readonly onReload: () => void }) {
  const own = pages.filter((one) => one.path.startsWith(`${section}/`) && !one.path.slice(section.length + 1).includes('/'))
  const [title, setTitle] = useState(entry?.title ?? '')
  const [ico, setIco] = useState<IconName | null>(iconOf(entry?.ico))
  const [hue, setHue] = useState<HueName | null>(hueOf(entry?.couleur))
  const [attachments, setAttachments] = useState(entry?.attachments !== false)
  const [page, setPage] = useState(entry?.page ?? '')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<Failure>()
  const fileOf = (one: IndexEntry) => one.path.slice(section.length + 1)
  const missing = page !== '' && !own.some((one) => fileOf(one) === page)
  const locked = loading === true || saving
  const sendable = !locked && !offline && failure !== 'forbidden' && failure !== 'conflict'

  const save = async () => {
    if (!sendable) return
    setSaving(true)
    setFailure(undefined)
    // The six keys are written as a whole: `app:` is shown, not edited, so it goes back as it was read.
    const settings: Settings = {
      ...(title.trim() !== '' ? { title: title.trim() } : {}),
      ...(ico ? { ico } : {}),
      ...(hue ? { couleur: hue } : {}),
      ...(entry?.app ? { app: entry.app } : {}),
      ...(attachments ? {} : { attachments: false }),
      ...(page !== '' ? { page } : {}),
    }
    const result = await requestJson(
      fetchImpl,
      '/api/folders/settings',
      jsonInit('PUT', { path: section, settings, ...(entry?.revision ? { revision: entry.revision } : {}) }),
      t,
    )
    setSaving(false)
    if (result.ok) {
      await refreshIndex?.()
      onClose()
      return
    }
    setFailure(result.status === 409 ? 'conflict' : result.status === 401 || result.status === 403 ? 'forbidden' : 'refused')
  }

  const reload = async () => {
    await refreshIndex?.()
    onReload()
  }

  const line =
    failure === 'conflict' ? null
    : failure === 'forbidden' ? t('You can no longer change this folder.')
    : failure === 'refused' ? t('The settings could not be written. Try again.')
    : offline ? t('You are offline.')
    : null

  return (
    <Sheet
      open
      title={t('Folder settings')}
      onClose={onClose}
      t={t}
      className="adestia-folder-settings"
      footer={
        <div className="adestia-sheet-actions">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="accent" icon="check" disabled={!sendable} onClick={() => void save()}>
            {saving ? t('Saving…') : t('Save')}
          </Button>
        </div>
      }
    >
      <form
        className="adestia-folder-settings__form"
        onSubmit={(event) => { event.preventDefault(); void save() }}
      >
        <Field label={t('Name shown')} help={t('Empty shows the folder’s own name.')}>
          <input
            className="adestia-input"
            type="text"
            value={title}
            maxLength={200}
            disabled={locked}
            data-autofocus
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
        </Field>
        <div className="adestia-field">
          <span className="adestia-field__label">{t('Icon')}</span>
          <IconPicker value={ico} onChange={setIco} label={t('Icon')} noneLabel={t('None')} disabled={locked} />
        </div>
        <div className="adestia-field">
          <span className="adestia-field__label">{t('Colour')}</span>
          <HuePicker
            value={hue}
            onChange={setHue}
            label={t('Colour')}
            noneLabel={t('None')}
            names={Object.fromEntries(HUE_NAMES.map((name) => [name, t(HUE_LABELS[name])])) as Record<HueName, string>}
            disabled={locked}
          />
        </div>
        <SettingRow label={t('Show attachments')}>
          {({ labelId }) => (
            <input
              type="checkbox"
              role="switch"
              className="adestia-toggle"
              aria-labelledby={labelId}
              checked={attachments}
              disabled={locked}
              onChange={(event) => setAttachments(event.currentTarget.checked)}
            />
          )}
        </SettingRow>
        {loading ? (
          <Loading t={t} />
        ) : (
          <Field
            label={t('Replacement page')}
            help={
              own.length === 0 && !missing
                ? t('This folder holds no page yet.')
                : `${t('Opening the folder shows this page. The classic view stays one link away.')}${appName ? ` ${t('It is behind that screen.')}` : ''}`
            }
          >
            <select
              className="adestia-select"
              value={page}
              disabled={locked || (own.length === 0 && !missing)}
              onChange={(event) => setPage(event.currentTarget.value)}
            >
              <option value="">{t('None — the classic view')}</option>
              {missing ? <option value={page}>{`${page} ${t('(missing)')}`}</option> : null}
              {own.map((one) => (
                <option key={`${one.store ?? ''}:${one.path}`} value={fileOf(one)} title={one.title || fileOf(one)}>
                  {one.title || fileOf(one)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {appName ? <p className="adestia-folder-settings__app">{t('Opens as the %app screen').replace('%app', appName)}</p> : null}
        {failure === 'conflict' ? (
          <p className="adestia-folder-settings__error" role="alert">
            {t('The folder settings changed.')}{' '}
            <Button small onClick={() => void reload()}>{t('Reload')}</Button>
          </p>
        ) : line ? (
          <p className="adestia-folder-settings__error" role="alert">{line}</p>
        ) : null}
      </form>
    </Sheet>
  )
}
