/**
 * The instance, asked once: what it is, its skin, its plugins, its pages —
 * and the page index kept live after that.
 */

import { useEffect, useState } from 'react'

import type { BlockComponents } from '../editor/Reader.js'
import { browserEnvironment, loadPlugins, type LoadedPlugin, type PluginDescriptor } from '../plugins/loader.js'
import { makePageEditor } from '../plugins/PageEditor.js'
import { resolveLocale, translator } from './i18n.js'
import { followChanges } from './live.js'
import type { IndexEntry, StoreInfo } from './sections.js'
import { browserSkinEnvironment, loadSkin, type Skin, type SkinDescriptor, type SkinSlots } from './skin.js'

export interface InstanceInfo {
  /**
   * Which build of Adestia is serving this page. Absent from a checkout —
   * the server sends it only when the image was stamped with a tag.
   */
  readonly version?: string
  readonly driver: { label: string; cliVersion: string; capabilities: readonly string[] }
  readonly auth: { mode: string }
  /** What the operator called this instance. Set only when they called it anything. */
  readonly name?: string
  /** Set only when the operator configured one; the browser decides otherwise. */
  readonly locale?: string
  readonly user: { userId: string; displayName: string } | null
  readonly skin: SkinDescriptor
  readonly plugins: readonly PluginDescriptor[]
  readonly pluginProblems: readonly {
    code?: string
    params?: Record<string, string>
    id: string
    reason: string
    /** Absent means refused — see the server's `DiscoveryProblem`. */
    severity?: 'refused' | 'degraded'
  }[]
  readonly turns: { max: number; running: number }
}

export interface InstanceOptions {
  readonly fetchImpl: typeof fetch
  readonly openPage: (path: string, store?: string) => void
  /** The chat's channel, read at call time: it mounts after this runs. */
  readonly askRef: { readonly current: ((prompt: string) => void) | undefined }
  readonly composeRef: { readonly current: ((text: string) => void) | undefined }
  /** The blocks the active plugins draw, read at call time for the same reason. */
  readonly blocksRef: { readonly current: BlockComponents }
  /** What the open plugin says about the screen it is showing. */
  readonly onTrail: (id: string, crumbs: readonly { label: string; route?: string }[]) => void
}

export function useInstance({ fetchImpl, openPage, askRef, composeRef, blocksRef, onTrail }: InstanceOptions) {
  const [instance, setInstance] = useState<InstanceInfo | undefined>()
  const [failures, setFailures] = useState<readonly { id: string; reason: string }[]>([])
  const [fatal, setFatal] = useState<string | undefined>()
  const [needsLogin, setNeedsLogin] = useState<'signin' | 'refused' | undefined>()
  const [pages, setPages] = useState<readonly IndexEntry[]>([])
  /**
   * The stores this instance composes — empty when it has only one, which is
   * how the shell knows there is no provenance to draw.
   */
  const [stores, setStores] = useState<readonly StoreInfo[]>([])
  const [skin, setSkin] = useState<Skin & SkinSlots>({})
  const [skinScheme, setSkinScheme] = useState<'light' | 'dark' | undefined>(undefined)
  const [loaded, setLoaded] = useState<readonly LoadedPlugin[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetchImpl('/api/instance')
        if (response.status === 401) {
          // Not an error to display: it means "sign in", and showing a status
          // code instead leaves the user reading a number with no way forward.
          if (!cancelled) setNeedsLogin('signin')
          return
        }
        if (response.status === 403) {
          // A different fact entirely: this account will never be let in, and
          // sending them back to the login page would loop them forever.
          if (!cancelled) setNeedsLogin('refused')
          return
        }
        if (!response.ok) throw new Error(`the server answered ${response.status}`)
        const info = (await response.json()) as InstanceInfo
        if (cancelled) return
        setInstance(info)

        const dressed = await loadSkin(info.skin, browserSkinEnvironment())
        if (!cancelled) {
          setSkin(dressed.skin)
          setSkinScheme(
            info.skin.scheme === 'light' || info.skin.scheme === 'dark'
              ? info.skin.scheme
              : undefined,
          )
          /*
           * The operator's name for the instance wins over the livery's.
           * Not a cosmetic order: this title is what iOS proposes when
           * somebody adds the page to their home screen, so it must agree
           * with the manifest — where the same precedence already applies.
           *
           * The header BRAND is left to the skin either way: what the OS
           * calls this window and what the body calls itself are two
           * different sentences.
           */
          const named = info.name ?? dressed.skin.title
          if (named) document.title = named
          // Off-contract fields are reported where the plugin problems are,
          // because a silently ignored field is an hour spent wondering why
          // nothing happens.
          const skinProblems = [
            ...(dressed.error ? [{ id: `skin:${info.skin.id}`, reason: dressed.error }] : []),
            ...(dressed.rejected.length > 0
              ? [
                  {
                    id: `skin:${info.skin.id}`,
                    reason: `ignored off-contract field(s): ${dressed.rejected.join(', ')}`,
                  },
                ]
              : []),
          ]
          if (skinProblems.length > 0) setFailures((current) => [...current, ...skinProblems])
        }

        // `ask` is handed to plugins through a ref: the chat owns that channel
        // and mounts after this runs, so a plugin holding the function directly
        // would hold one that is not wired yet.
        // The plugins are loaded once the instance has answered, so this is
        // the resolved locale rather than a guess.
        const pluginLocale = resolveLocale(
          info.locale,
          typeof navigator === 'undefined' ? undefined : navigator.language,
        )
        const environment = browserEnvironment(
          (prompt) => askRef.current?.(prompt),
          (text) => composeRef.current?.(text),
          pluginLocale,
          (id, crumbs) => onTrail(id, crumbs),
          // The shell's own editor, lent to plugins whose screen is made of
          // pages. Built here because only the shell knows the instance's
          // language and how to open a page a wikilink points at.
          makePageEditor({
            locale: pluginLocale,
            t: translator(pluginLocale),
            fetchImpl,
            openPage,
            blocks: () => blocksRef.current,
          }),
        )
        const result = await loadPlugins(info.plugins, environment)
        if (!cancelled) {
          setLoaded(result.loaded)
          setFailures((current) => [...current, ...result.failures])
        }

        // The INDEX rather than the plain list: sections are dressed by their
        // index page's frontmatter, and only this endpoint carries it.
        const list = await fetchImpl('/api/pages/index')
        if (list.ok && !cancelled) {
          // Checked rather than trusted: this JSON crosses a process boundary,
          // and a shape the shell did not expect used to reach `sectionsOf`
          // and throw mid-render — blanking the whole app over a payload that
          // merely had no pages in it.
          const body = (await list.json()) as { entries?: IndexEntry[]; stores?: StoreInfo[] }
          setPages(Array.isArray(body.entries) ? body.entries : [])
          setStores(Array.isArray(body.stores) ? body.stores : [])
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
    // Every one of these is stable by construction — refs, a useCallback with
    // no dependencies — so the list is honest and the effect still runs once
    // per fetchImpl, as it did when it lived in the component.
  }, [fetchImpl, openPage, askRef, composeRef, blocksRef, onTrail])

  /**
   * The index, kept live.
   *
   * The agent writes pages with its own file tools, so the fetch above is a
   * snapshot the browser has no reason to retake — a page created mid-chat
   * existed everywhere except on the screen of the person who asked for it.
   * The server's change feed says when the set moved; the index is refetched
   * whole rather than patched, because the endpoint is cheap and one source
   * of truth beats a client-side merge.
   *
   * Only the index: the OPEN page is not reloaded from here, since the editor
   * may hold words the person has not saved, and its revision check already
   * arbitrates that conflict on save.
   */
  useEffect(() => {
    if (!instance) return undefined
    const controller = new AbortController()
    void followChanges({
      fetchImpl,
      signal: controller.signal,
      onChange: async () => {
        const list = await fetchImpl('/api/pages/index').catch(() => undefined)
        if (!list?.ok || controller.signal.aborted) return
        const body = (await list.json()) as { entries?: IndexEntry[]; stores?: StoreInfo[] }
        setPages(Array.isArray(body.entries) ? body.entries : [])
        setStores(Array.isArray(body.stores) ? body.stores : [])
      },
    })
    return () => controller.abort()
  }, [instance, fetchImpl])

  return { instance, failures, fatal, needsLogin, pages, stores, skin, skinScheme, loaded }
}
