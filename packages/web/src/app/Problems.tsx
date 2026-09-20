/**
 * Every refusal, said out loud: the server's, the browser's, and a folder's
 * `app:` that names nothing this instance runs.
 */

import type { LoadedPlugin } from '../plugins/loader.js'
import { strayApp } from './owners.js'
import type { IndexEntry } from './sections.js'
import type { InstanceInfo } from './useInstance.js'

/**
 * A plugin problem, in the reader's language when it has an identity.
 *
 * The server writes English prose where the problem is detected, which is the
 * right thing for a log and the wrong thing under a translated heading. A
 * problem somebody is meant to ACT on carries a code instead, and is said here.
 * Anything else falls back to the prose — visibly untranslated beats
 * mistranslated, and beats a raw code by a mile.
 */
const SAID: Readonly<Record<string, string>> = {
  'missing-secret': 'runs without the secret %name, which this instance does not provide',
  'source-unreachable': 'could not be fetched at %ref, and nothing is cached — what it brings is absent',
  'source-stale': 'could not be refreshed at %ref — running on the cached copy (%head)',
  'source-missing': 'is declared as an extension source but is not a directory on this instance',
}

function say(
  t: (key: string) => string,
  problem: { reason: string; code?: string; params?: Record<string, string> },
): string {
  const key = problem.code === undefined ? undefined : SAID[problem.code]
  if (key === undefined) return problem.reason
  return Object.entries(problem.params ?? {}).reduce(
    (said, [name, value]) => said.replaceAll(`%${name}`, value),
    t(key),
  )
}

export function Problems({
  instance,
  failures,
  loaded,
  pages,
  t,
}: {
  readonly instance: InstanceInfo
  readonly failures: readonly { id: string; reason: string }[]
  readonly loaded: readonly LoadedPlugin[]
  readonly pages: readonly IndexEntry[]
  readonly t: (key: string) => string
}) {
  // Every refusal reaches the user: the server's (a malformed manifest) and
  // the browser's (a module that would not import). A plugin silently absent
  // is the failure mode this whole design exists to avoid.
  //
  // A browser-side failure is always a refusal: the facet did not load, so
  // whatever it contributed is gone. Only the server reports the softer kind.
  const problems: readonly {
    id: string
    reason: string
    severity?: 'refused' | 'degraded'
    code?: string
    params?: Record<string, string>
  }[] = [
    ...instance.pluginProblems,
    ...failures,
    // An `app:` written where it will never be read — deeper than the top
    // level, or naming a plugin this instance does not run. Reported HERE
    // rather than left to be noticed: a declaration that does nothing is an
    // hour spent wondering why the folder opens on the wrong screen.
    ...strayApp(loaded, pages).map((stray) => ({
      id: stray.path,
      reason: stray.reason,
      severity: 'degraded' as const,
    })),
  ]

  return (
    <>
      {/*
        Two different facts, and conflating them sends somebody hunting for a
        plugin that works: REFUSED means the extension is off, DEGRADED means
        it is running with something missing. Both are worth saying out loud;
        only one is a problem to fix before the app can be used.
      */}
      {(['refused', 'degraded'] as const).map((severity) => {
        const listed = problems.filter((problem) => (problem.severity ?? 'refused') === severity)
        if (listed.length === 0) return null
        return (
          <section key={severity} className={`adestia-problems adestia-problems--${severity}`} role="status">
            <h2>{t(severity === 'refused' ? 'Extensions refused' : 'Running with something missing')}</h2>
            <ul>
              {listed.map((problem) => (
                <li key={`${problem.id}-${problem.reason.slice(0, 20)}`}>
                  <strong>{problem.id}</strong>: {say(t, problem)}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}
