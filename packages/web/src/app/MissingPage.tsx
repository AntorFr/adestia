/**
 * What the shell says when a page will not load.
 *
 * It used to say nothing at all. `if (!response.ok) return` left the screen
 * showing whatever was already on it — the home, most of the time — so a page
 * that does not exist, a session that has expired and a server that fell over
 * produced one identical silence. The reader's reading of that silence is
 * always the same and always wrong: "the link is broken".
 *
 * Found the hard way: an agent handed somebody a mistyped address, the shell
 * showed the home, and it took ten minutes and a container shell to establish
 * that the page it named had never existed.
 *
 * So: name the address, say which of the three it was, and offer the folder
 * above — which is where somebody looking for a page they cannot find should
 * go next, and the one thing this screen knows for certain.
 */

import { sectionRoute } from './owners.js'

export interface MissingPageProps {
  /** The path as it was asked for, `.md` included — what the reader typed. */
  readonly path: string
  /** What the server answered. */
  readonly status: number
  /** The shell's translator; identity in English. */
  readonly t?: (key: string) => string
}

export function MissingPage({ path, status, t = (key) => key }: MissingPageProps) {
  const folder = path.split('/').slice(0, -1).join('/')
  const reason =
    status === 404
      ? t('There is no page at this address.')
      : status === 401 || status === 403
        ? t('This page is out of reach — the session may have expired.')
        : t('The server could not serve this page.')

  return (
    <section className="adestia-missing">
      <h2 className="adestia-missing__title">{reason}</h2>
      <p className="adestia-missing__path">{path}</p>
      {folder ? (
        <p>
          <a href={`#${sectionRoute(folder)}`}>{t('Open the folder above')}</a>
        </p>
      ) : null}
    </section>
  )
}
