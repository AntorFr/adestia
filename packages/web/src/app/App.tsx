/**
 * The shell: chat rail, resizable gutter, apps canvas.
 *
 * It knows the instance only through `/api/instance` — capabilities, active
 * plugins, the skin — and never which CLI runs behind it. That is what makes a
 * second engine a driver rather than a fork.
 */

import { useEffect, useState } from 'react'

import { Chat } from '../chat/Chat.js'
import { Editor, type PageDocument } from '../editor/Editor.js'
import { Settings } from './Settings.js'
import { browserEnvironment, loadPlugins, type PluginDescriptor } from '../plugins/loader.js'
import { useMobile } from './useMobile.js'
import { useSplit } from './useSplit.js'

export interface InstanceInfo {
  readonly driver: { label: string; cliVersion: string; capabilities: readonly string[] }
  readonly auth: { mode: string }
  readonly user: { userId: string; displayName: string } | null
  readonly skin: string
  readonly plugins: readonly PluginDescriptor[]
  readonly pluginProblems: readonly { id: string; reason: string }[]
  readonly turns: { max: number; running: number }
}

type EditorMount = (
  element: HTMLElement,
  markdown: string,
  onChange: (markdown: string) => void,
) => () => void

export function App({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const [instance, setInstance] = useState<InstanceInfo | undefined>()
  const [failures, setFailures] = useState<readonly { id: string; reason: string }[]>([])
  const [fatal, setFatal] = useState<string | undefined>()
  const [screen, setScreen] = useState<'chat' | 'canvas'>('chat')
  const [pages, setPages] = useState<readonly { path: string; title: string }[]>([])
  const [page, setPage] = useState<PageDocument | undefined>()
  /**
   * The editor is loaded on demand: ProseMirror and Milkdown weigh more than
   * the entire rest of the shell, and someone who only wants to chat should
   * not download an editor to do it. Same discipline the plugin loader
   * applies to a heavy chunk.
   */
  const [mount, setMount] = useState<EditorMount | undefined>()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const split = useSplit()
  const mobile = useMobile()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetchImpl('/api/instance')
        if (!response.ok) throw new Error(`the server answered ${response.status}`)
        const info = (await response.json()) as InstanceInfo
        if (cancelled) return
        setInstance(info)

        const result = await loadPlugins(info.plugins, browserEnvironment())
        if (!cancelled) setFailures(result.failures)

        const list = await fetchImpl('/api/pages')
        if (list.ok && !cancelled) {
          setPages(((await list.json()) as { pages: { path: string; title: string }[] }).pages)
        }
      } catch (error) {
        // A shell that renders an empty page when the API is unreachable makes
        // its user reload forever; naming the failure costs one line.
        if (!cancelled) setFatal((error as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchImpl])

  if (fatal) {
    return (
      <main className="golem-fatal" role="alert">
        <h1>Golem could not start</h1>
        <p>{fatal}</p>
      </main>
    )
  }

  if (!instance) return <main className="golem-loading">Loading…</main>

  // Every refusal reaches the user: the server's (a malformed manifest) and
  // the browser's (a module that would not import). A plugin silently absent
  // is the failure mode this whole design exists to avoid.
  const problems = [...instance.pluginProblems, ...failures]

  return (
    <div
      className="golem-shell"
      data-skin={instance.skin}
      data-mobile={mobile ? 'true' : undefined}
      data-screen={mobile ? screen : undefined}
    >
      <Chat
        fetchImpl={fetchImpl}
        {...(mobile ? { onOpenCanvas: () => setScreen('canvas') } : {})}
      />
      <div className="golem-gutter" {...split.gutterProps} />
      <main className="golem-canvas">
        <header className="golem-canvas__header">
          {/* Folded onto one screen, the canvas needs its own way back — the
              CSS alone would hide it with no route to it at all. */}
          {mobile && (
            <button
              type="button"
              className="golem-switch"
              onClick={() => setScreen('chat')}
              aria-label="Back to the chat"
            >
              ‹ Chat
            </button>
          )}
          <span className="golem-canvas__brand">Golem</span>
          <span className="golem-canvas__spacer" />
          <span className="golem-canvas__driver">
            {instance.driver.label} {instance.driver.cliVersion}
          </span>
          <button
            type="button"
            className="golem-switch"
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label="Settings"
            aria-expanded={settingsOpen}
          >
            ⚙
          </button>
        </header>

        {settingsOpen && <Settings fetchImpl={fetchImpl} />}

        {problems.length > 0 && (
          <section className="golem-problems" role="status">
            <h2>Extensions refused</h2>
            <ul>
              {problems.map((problem) => (
                <li key={`${problem.id}-${problem.reason.slice(0, 20)}`}>
                  <strong>{problem.id}</strong>: {problem.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

        {page ? (
          <>
            <button type="button" className="golem-switch" onClick={() => setPage(undefined)}>
              ‹ All pages
            </button>
            <Editor page={page} fetchImpl={fetchImpl} {...(mount ? { mount } : {})} />
          </>
        ) : (
          <>
            {pages.length > 0 && (
              <ul className="golem-pages">
                {pages.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className="golem-pages__link"
                      onClick={() => {
                        void (async () => {
                          const [response, editor] = await Promise.all([
                            fetchImpl(`/api/pages/${entry.path}`),
                            import('../editor/milkdown.js'),
                          ])
                          if (!response.ok) return
                          // Stored via a thunk: passing a function to setState
                          // directly would have React call it as an updater.
                          setMount(() => editor.mountMilkdown)
                          setPage((await response.json()) as PageDocument)
                        })()
                      }}
                    >
                      {entry.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}

        {instance.plugins.length === 0 ? (
          <section className="golem-empty">
            <p>No app is active yet.</p>
            <p className="golem-empty__hint">
              Drop a plugin under <code>plugins/</code> and name it in{' '}
              <code>golem.config.yaml</code>.
            </p>
          </section>
        ) : (
          <ul className="golem-tiles">
            {instance.plugins
              .filter((plugin) => plugin.tile)
              .map((plugin) => (
                <li key={plugin.id} className="golem-tile">
                  <span className="golem-tile__icon">{plugin.tile?.icon ?? '▩'}</span>
                  <span className="golem-tile__label">{plugin.tile?.label}</span>
                </li>
              ))}
          </ul>
        )}
          </>
        )}
      </main>
    </div>
  )
}
