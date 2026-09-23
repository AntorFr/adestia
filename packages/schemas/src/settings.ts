/**
 * The settings an operator may change from the browser, declared once.
 *
 * `adestia.config.yaml` stays the single source of truth — a click does not
 * shadow it in some second file, it EDITS it, comments and all. What this
 * catalogue adds is the half a YAML file cannot carry: which keys a form may
 * touch, what kind of control each one wants, what it means in a sentence,
 * and whether changing it costs a restart.
 *
 * Declared here, in `schemas`, because both sides need the SAME answer: the
 * server validates a proposed change against this list, and the screen draws
 * itself from it. Two copies would drift into a field the screen offers and
 * the server refuses — which is the worst of the two, since the operator only
 * learns at the moment they press save.
 *
 * WHAT IS DELIBERATELY ABSENT, and it is the important half. Some of this
 * file's keys are not configuration, they are CODE: `driver.command` is a
 * binary the server spawns, and `extensions.sources` + `extensions.apps` make
 * it clone a repository and run its setup script. An instance running
 * `auth.mode: none` — the ordinary shape on a laptop — would hand that to
 * anything that reaches the port. So the frontier stays where it is today:
 * the file, edited by whoever can reach the machine. Secrets and the OIDC
 * client secret are absent for the same reason, one notch stronger — they
 * never leave the server at all.
 */

/** What kind of control a setting wants, and therefore how it is validated. */
export type SettingKind = 'toggle' | 'number' | 'choice' | 'text'

export interface SettingSpec {
  /**
   * The key path inside the YAML document, as segments.
   *
   * Segments, not a dotted string: a dotted string has to be split by
   * somebody, and the one place it would be split is the one place a key
   * containing a dot would break the editor for good.
   */
  readonly path: readonly string[]
  readonly kind: SettingKind
  /** The field's name on screen, in English; the shell translates it. */
  readonly label: string
  /** One sentence: what it does, and when an operator would touch it. */
  readonly help: string
  /** `number` only, both inclusive. */
  readonly min?: number
  readonly max?: number
  /** `number` only: the unit written beside the field, already translated. */
  readonly unit?: string
  /** `choice` only. */
  readonly choices?: readonly { readonly value: string; readonly label: string }[]
  /**
   * What the instance does with no value at all, so the screen can say
   * "default" rather than showing an empty field that looks broken.
   */
  readonly fallback: boolean | number | string
  /**
   * Whether the running instance picks the change up on its own.
   *
   * Almost nothing does today, and saying so is the point: a field that
   * silently needs a restart is a field that reads as broken for however long
   * it takes the operator to think of restarting.
   */
  readonly applies: 'live' | 'restart'
}

/**
 * The catalogue.
 *
 * Grouped the way the screen groups them, and in the order it draws them —
 * the order is editorial, so it lives with the declaration rather than in the
 * component, where a second list would have to be kept in step.
 */
export interface SettingGroup {
  readonly id: string
  readonly label: string
  /** What this group of fields is for, above them. */
  readonly lede: string
  readonly settings: readonly SettingSpec[]
}

export const SETTING_GROUPS: readonly SettingGroup[] = [
  {
    id: 'watch',
    label: 'Live refresh',
    lede:
      'The agent writes pages with its own file tools, so the server only learns of them by watching the disk. Native file events cannot cross some mounts — WSL’s /mnt/c, NFS, SMB, some Docker bind mounts — and scanning is the way through.',
    settings: [
      {
        path: ['workspace', 'watch', 'enabled'],
        kind: 'toggle',
        label: 'Announce changes to open shells',
        help: 'Off, a page the agent just wrote appears only after a reload.',
        fallback: true,
        applies: 'restart',
      },
      {
        path: ['workspace', 'watch', 'polling'],
        kind: 'toggle',
        label: 'Scan instead of listening',
        help:
          'Turn on when the pages tree sits on a mount native file events cannot cross. It costs a periodic scan of the tree.',
        fallback: false,
        applies: 'restart',
      },
      {
        path: ['workspace', 'watch', 'intervalMs'],
        kind: 'number',
        label: 'Scan period',
        help: 'How long between two scans. Ignored unless scanning is on.',
        min: 100,
        max: 600_000,
        unit: 'ms',
        fallback: 2000,
        applies: 'restart',
      },
    ],
  },
]

/** Every setting, flat, for the server's lookups. */
export const SETTINGS: readonly SettingSpec[] = SETTING_GROUPS.flatMap((group) => group.settings)

/** A key path as one string, for an error message or a map key — never for splitting. */
export function settingKey(path: readonly string[]): string {
  return path.join('.')
}

/** The spec a key path names, if the catalogue declares it. */
export function settingAt(path: readonly string[]): SettingSpec | undefined {
  const wanted = settingKey(path)
  return SETTINGS.find((spec) => settingKey(spec.path) === wanted)
}

/** Where a value on screen comes from, which the screen says out loud. */
export type SettingSource = 'file' | 'default'

/** One setting, as the browser receives it. */
export interface SettingView {
  readonly path: readonly string[]
  readonly value: boolean | number | string
  readonly source: SettingSource
}

/** The whole screen's payload: what is declared, what is set, and what may be written. */
export interface SettingsPayload {
  readonly groups: readonly SettingGroup[]
  readonly values: readonly SettingView[]
  /** The config file's path, which the screen names — an operator edits it too. */
  readonly file: string
  /**
   * Whether this instance can write that file at all.
   *
   * False on the deployments this product is built for: a Kubernetes
   * ConfigMap and a `:ro` bind mount are both read-only by construction. The
   * screen must say so BEFORE somebody fills a form, not after the save that
   * fails — and the fields go read-only rather than disappearing, because
   * seeing the instance's own settings is worth the screen on its own.
   */
  readonly writable: boolean
  /** Why not, when it is not: the operator has to know which mount to change. */
  readonly readOnlyReason?: string
  /**
   * The file's revision when it was read, sent back on save.
   *
   * The file is hand-edited too — that is the whole point of keeping it the
   * source of truth — so a form submitted from a screen opened ten minutes
   * ago must not quietly undo an edit made in a terminal since.
   */
  readonly revision: string
}
