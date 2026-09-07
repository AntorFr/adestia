/**
 * `#/meals/<path>` — a period alone in its screen.
 *
 * The same frise the block draws, mounted without the page around it. That is
 * what makes a period ADDRESSABLE: it belongs to no domain, it hangs off the
 * fiche with a reason to mention it, and one file may be cited from several
 * fiches. Without a screen of its own, `vue="lien"` would have nowhere to lead
 * and the non-duplication would fall.
 *
 * It is also the screen the daily gesture wants. Logging what you ate should
 * not mean opening a page and scrolling to a block.
 *
 * A view with NO TILE, deliberately: a week of meals is not an app and has
 * nothing to launch from the home. The route alone is enough, and the launcher
 * stays the list of things one opens rather than the list of what exists.
 */

import { createElement as h, useEffect, useState } from 'react'

import Frise from './frise.js'
import { words } from './model.js'
import { folderOf, pathOf } from './route.js'

export default function view(api) {
  const t = words(api.locale)

  function MealsAlone() {
    const [path, setPath] = useState(() => pathOf(window.location.hash))

    useEffect(() => {
      const onHash = () => setPath(pathOf(window.location.hash))
      window.addEventListener('hashchange', onHash)
      return () => window.removeEventListener('hashchange', onHash)
    }, [])

    if (!path) {
      return h('section', { className: 'meals-page' }, h('p', { className: 'meals-empty' }, t('No period in this address.')))
    }

    const src = `/api/files/${path.split('/').map(encodeURIComponent).join('/')}`
    const folder = folderOf(path)

    // Where this period is filed. A line of CONTEXT, not a way back — the
    // shell already draws one above, and two stacked chevrons read as a bug.
    // What it adds is what the breadcrumb cannot: a `#/meals/…` link shared or
    // bookmarked arrives here saying nothing of the trip it belongs to.
    return h('section', { className: 'meals-page' }, [
      folder && folder !== path
        ? h('p', { key: 'd', className: 'meals-in' }, [
            t('In '),
            h(
              'a',
              { key: 'a', href: `#/section/${folder.split('/').map(encodeURIComponent).join('/')}` },
              folder.split('/').filter(Boolean).at(-1),
            ),
          ])
        : null,
      h(Frise, { key: 'f', api, src, path }),
    ])
  }

  // A route with no tile: the shell serves it, the launcher ignores it.
  return { component: MealsAlone, route: '/meals' }
}
