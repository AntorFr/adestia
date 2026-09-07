/**
 * The whole-page layout for a page typed `meals`.
 *
 * This is the adapter, and it is deliberately thin: the shell has already
 * decided this page belongs to us — it matched the frontmatter `type` against
 * the claim in our manifest — so all that is left is to say what draws.
 *
 * It hands the frise a PATH and nothing more. The shell also offers the
 * page's parsed frontmatter, and using it here would be the tempting mistake:
 * the server parses the same frontmatter to find the data file and to validate
 * a placement, so a screen reading its own copy would be a second opinion
 * about the same page. One answer, from the side that will enforce it.
 *
 * Reading posture only. The shell's ✎ still opens the markdown, which is how a
 * wrong date or a missing section gets fixed — on the page, in the editor
 * everybody already knows, rather than by hunting for a file.
 */

import { createElement as h } from 'react'

import Frise from './frise.js'

export default function layouts(api) {
  function MealsPage({ path, children }) {
    // The page's own body FIRST, then the frise. A period opens with a
    // sentence or two saying how it is kept — «je scanne quand il y a un
    // code-barres, je pèse sinon» — and that belongs above the days rather
    // than behind the pencil.
    return h('div', { className: 'meals-page' }, [
      h('div', { key: 'b', className: 'meals-prose' }, children),
      h(Frise, { key: 'f', api, page: path }),
    ])
  }

  return { types: { meals: MealsPage } }
}
