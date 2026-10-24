/** One server, opened: where it came from, how it is doing, and its declaration. */

import type { McpServerView } from '@antorfr/adestia-schemas'

import { Icon } from '../Icon.js'
import { beginSignIn, type McpConnection } from '../signin.js'
import type { McpServerHealth } from '../Settings.js'
import { Button, Field } from '../ui/index.js'
import { provenance, stateOf } from './health.js'
import type { Save } from './useDeclaration.js'

export interface ServerDetailProps {
  /** Undefined while a new server is being written. */
  readonly shown: McpServerView | undefined
  readonly adding: boolean
  readonly state: McpServerHealth | undefined
  readonly connection: McpConnection | undefined
  readonly draft: string
  readonly dirty: boolean
  readonly save: Save
  readonly onDraft: (text: string) => void
  readonly onSave: () => void
  readonly onRemove: () => void
  readonly t: (key: string) => string
}

function Heading({ shown, adding, t }: Pick<ServerDetailProps, 'shown' | 'adding' | 't'>) {
  const lede = adding
    ? t('Written here, kept beside the instance data — not in the configuration file.')
    : shown
      ? `${provenance(shown, t)} · ${shown.transport === 'http' ? t('over HTTP') : t('a local process')}`
      : ''
  return (
    <header className="adestia-chead">
      <span className="adestia-chead__icon" aria-hidden="true">
        <Icon name="plug" />
      </span>
      <div>
        <h1 className="adestia-chead__title">{adding ? t('A new server') : shown?.name}</h1>
        <p className="adestia-chead__lede">{lede}</p>
      </div>
    </header>
  )
}

function SignIn({ name, connected, t }: { name: string; connected: boolean; t: (key: string) => string }) {
  return (
    <p className="adestia-mcp__state adestia-connect adestia-connect--tile">
      <span className="adestia-connect__text">
        {connected
          ? t('Connected for you — your turns reach it as you.')
          : t('Not connected for you yet — this server signs each person in.')}
      </span>
      <Button variant="accent" small icon="plug" onClick={() => beginSignIn(name)}>
        {connected ? t('Reconnect') : t('Connect')}
      </Button>
    </p>
  )
}

function Actions(props: ServerDetailProps) {
  const { adding, dirty, save, onSave, onRemove, t } = props
  return (
    <div className="adestia-mcp__bar">
      {save.kind === 'failed' && (
        <span className="adestia-save adestia-save--error" role="alert">
          <Icon name="circle-alert" />
          {save.message}
        </span>
      )}
      {save.kind === 'saved' && !dirty && <span className="adestia-save">{t('Saved')}</span>}
      <span className="adestia-mcp__spacer" />
      {!adding && (
        <Button variant="danger" onClick={onRemove}>
          {t('Remove')}
        </Button>
      )}
      <Button
        variant="accent"
        icon="save"
        onClick={onSave}
        disabled={!dirty || save.kind === 'saving'}
        busy={save.kind === 'saving'}
      >
        {save.kind === 'saving' ? t('Saving…') : t('Save')}
      </Button>
    </div>
  )
}

export function ServerDetail(props: ServerDetailProps) {
  const { shown, adding, state, connection, draft, onDraft, t } = props
  const tone = stateOf(state?.state)
  const editable = adding || shown?.editable === true

  return (
    <section className="adestia-mcp">
      {/* No back button of its own: the shell draws one, and it climbs one
          level. Two of them stacked is what this screen shipped with. */}
      <Heading shown={shown} adding={adding} t={t} />

      {tone && (
        <p className="adestia-mcp__state">
          <span className={`adestia-stat adestia-stat--icon adestia-stat--${tone.tone}`}>
            <Icon name={tone.icon} />
            {t(tone.label)}
          </span>
          {/* Only ever what the CLI said. A reason is never invented. */}
          {state?.error && <span className="adestia-mcp__why">{state.error}</span>}
        </p>
      )}

      {/* The tile's half of the sign-in surface: connect BEFORE the first
          demand, or reconnect after a key died. Per person — the state and
          the button are the viewer's own, never the instance's. */}
      {shown?.config['signIn'] === 'oauth' && (
        <SignIn name={shown.name} connected={connection?.connected === true} t={t} />
      )}

      {shown?.shadowed && (
        <p className="adestia-save adestia-save--error" role="alert">
          <Icon name="triangle-alert" />
          {t('The configuration file now declares this name too, and it wins — this one is not wired.')}
        </p>
      )}

      {!editable && (
        <p className="adestia-mcp__note">
          {t('Read-only here: this one is declared elsewhere, and an edit would be undone at the next start.')}
        </p>
      )}

      <div className="adestia-mcp__declaration">
        <Field label={t('Server declaration')}>
          <textarea
            className="adestia-textarea adestia-mcp__config"
            value={draft}
            spellCheck={false}
            readOnly={!editable}
            onChange={(event) => onDraft(event.target.value)}
          />
        </Field>
      </div>

      {editable && <Actions {...props} />}

      {tone && (
        <p className="adestia-mcp__note">
          {t('Reported when a turn last ran — the CLI loads them with the session.')}
        </p>
      )}
    </section>
  )
}
