/**
 * The `:::meals` block — the adapter between the page and the frise.
 *
 * THE CONTRACT, in two halves that never restate each other. The manifest says
 * what a `:::meals` IS — its name, its attributes, the fact that it has no
 * body — because the server validates pages and cannot execute a module
 * written for a browser. This file brings only what a manifest cannot carry:
 * the component that draws it.
 *
 * TWO VIEWS, and it is what spares this plugin a domain of its own. A period
 * of meals has no home: it hangs off the fiche with a reason to hold it — a
 * trip, a health carnet, a week of journal — and stays addressable alone at
 * `#/meals/<path>`. `vue="lien"` lays a compact card that leads there, so a
 * fiche can cite two weeks without stacking two frises.
 */

import { createElement as h, useEffect, useState } from 'react'

import Frise from './frise.js'
import { dayLabel, words } from './model.js'
import { routeOf } from './route.js'

export default function blocks(api) {
  const t = words(api.locale)

  /** The compact form: a card that says which period it leads to. */
  function Lien({ src, path }) {
    const [plan, setPlan] = useState()
    useEffect(() => {
      let alive = true
      void (async () => {
        try {
          const response = await api.fetch(src)
          if (response.ok && alive) setPlan(await response.json())
        } catch {
          // The link still leads somewhere; only its label is poorer.
        }
      })()
      return () => {
        alive = false
      }
    }, [src])

    return h(
      'a',
      { className: 'meals meals-lien', href: routeOf(path) },
      h('span', { className: 'meals-lien-body' }, [
        h('span', { key: 't', className: 'meals-title' }, plan?.titre || path.split('/').at(-1)),
        // Spelled out, like the frise's own header: the compact form is the
        // same period seen smaller, not a rawer one.
        plan?.debut && plan?.fin
          ? h(
              'span',
              { key: 'p', className: 'meals-period' },
              `${dayLabel(plan.debut, api.locale)} → ${dayLabel(plan.fin, api.locale)}`,
            )
          : null,
      ]),
    )
  }

  function Meals({ attributes, resolve, locate }) {
    const source = attributes.source ?? ''
    const src = resolve(source)
    const path = locate(source)
    if (attributes.vue === 'lien') return h(Lien, { src, path })
    return h(Frise, { api, src, path })
  }

  return { tags: { meals: Meals } }
}
