import { createElement as h, useCallback, useEffect, useState } from 'react'

import { buildCollections, facetsOf, plural, prettify, statusOf } from './model.js'

const WORDS = {
  // English needs a table of its own for exactly one word: `archived` does not
  // agree in number and `archivée` does, so the plural is a WORD rather than
  // an `s` this code appends. Everything else falls back to its key.
  en: { 'archived, plural': 'archived' },
  fr: {
    collection: 'collection',
    collections: 'collections',
    incomplete: 'incomplètes',
    Collections: 'Collections',
    'No collection declared yet.': 'Aucune collection déclarée.',
    '＋ Ask for a collection': '＋ Demander une collection',
    Uncategorised: 'Sans catégorie',
    page: 'fiche',
    archived: 'archivée',
    'archived, plural': 'archivées',
    Archive: 'Archive',
    'nothing live': 'rien en cours',
    'Everything here is finished.': 'Tout est terminé ici.',
  },
}
const words = (locale) => {
  const table = WORDS[String(locale ?? '').slice(0, 2)] ?? {}
  return (key) => table[key] ?? key
}

export default function view(api) {
  const t = words(api.locale)
  /** "1 archivée", "2 archivées", "3 archived" — the count, in agreement. */
  const archived = (count) => `${count} ${t(count > 1 ? 'archived, plural' : 'archived')}`

  function Collections() {
    const [model, setModel] = useState(null)
    const [error, setError] = useState(null)
    /** Where we are: nothing, a collection, or a facet inside one. */
    const [at, setAt] = useState({ collection: null, facet: null })

    const reload = useCallback(async () => {
      try {
        const response = await api.fetch('/api/pages/index')
        if (!response.ok) throw new Error(`the page index answered ${response.status}`)
        setModel(buildCollections((await response.json()).entries))
      } catch (cause) {
        setError(cause.message)
      }
    }, [])

    useEffect(() => {
      void reload()
    }, [reload])

    if (error) return h('p', { className: 'coll-problem' }, error)
    if (!model) return h('p', { className: 'coll-muted' }, 'Loading…')

    const open = model.collections.find((c) => c.id === at.collection)

    const pageRow = (page) =>
      h('li', { key: page.id, className: 'coll-row' }, [
        h(
          'a',
          { key: 'l', className: 'coll-row__link', href: `#/pages/${page.path}` },
          page.title,
        ),
        statusOf(page) && h('span', { key: 's', className: 'coll-chip' }, statusOf(page)),
      ])

    /**
     * What is done, folded away — present, and out of the way.
     *
     * Closed rather than absent: a finished project is what somebody comes
     * looking for when they want to know how the last one went, and a
     * collection that quietly forgot half of itself would be lying about its
     * own size. Open by default only when there is nothing live left, so a
     * screen is never blank while the pages exist.
     */
    const archiveFold = (pages, live) =>
      pages.length === 0
        ? null
        : h('details', { key: 'arch', className: 'coll-arch', open: live === 0 }, [
            h('summary', { key: 's' }, [
              `🗄 ${t('Archive')} `,
              h('span', { key: 'c', className: 'coll-muted' }, plural(pages.length, t('page'))),
            ]),
            h('ul', { key: 'l', className: 'coll-rows' }, pages.map(pageRow)),
          ])

    // A facet, opened: what is live in it, then what is done.
    if (open && at.facet !== null) {
      const facet = (facetsOf(open, t) ?? []).find((f) => f.value === at.facet)
      const live = facet?.pages ?? []
      const archived = facet?.archived ?? []
      return h('section', { className: 'coll' }, [
        h(
          'button',
          { key: 'b', className: 'coll-back', onClick: () => setAt({ ...at, facet: null }) },
          `‹ ${open.title}`,
        ),
        h('h2', { key: 'h' }, facet?.label ?? prettify(at.facet)),
        live.length > 0
          ? h('ul', { key: 'l', className: 'coll-rows' }, live.map(pageRow))
          : archived.length > 0 &&
            h('p', { key: 'e', className: 'coll-muted' }, t('Everything here is finished.')),
        archiveFold(archived, live.length),
      ])
    }

    // A collection, opened: its facets as cards, or its pages if it groups by nothing.
    if (open) {
      const facets = facetsOf(open, t)
      return h('section', { className: 'coll' }, [
        h(
          'button',
          { key: 'b', className: 'coll-back', onClick: () => setAt({ collection: null, facet: null }) },
          '‹ Collections',
        ),
        h('header', { key: 'h', className: 'coll__head' }, [
          h('h2', { key: 't' }, `${open.icon} ${open.title}`),
          // What is live, and what is done — two figures, because "40 pages"
          // over a grid showing four is the kind of arithmetic that makes
          // people stop trusting a count.
          h(
            'span',
            { key: 'c', className: 'coll-muted' },
            [
              plural(open.live.length, t('page')),
              open.archived.length > 0 ? archived(open.archived.length) : '',
            ]
              .filter(Boolean)
              .join(' · '),
          ),
        ]),
        open.problem && h('p', { key: 'p', className: 'coll-problem' }, open.problem),

        facets
          ? h(
              'ul',
              { key: 'f', className: 'coll-cards' },
              facets.map((facet) =>
                h(
                  'li',
                  { key: facet.value },
                  h(
                    'button',
                    { className: 'coll-card', onClick: () => setAt({ ...at, facet: facet.value }) },
                    [
                      h('span', { key: 'n', className: 'coll-card__name' }, facet.label),
                      h(
                        'span',
                        { key: 'c', className: 'coll-muted' },
                        [
                          facet.pages.length > 0
                            ? plural(facet.pages.length, t('page'))
                            : t('nothing live'),
                          facet.archived.length > 0 ? archived(facet.archived.length) : '',
                        ]
                          .filter(Boolean)
                          .join(' · '),
                      ),
                    ],
                  ),
                ),
              ),
            )
          : h('ul', { key: 'r', className: 'coll-rows' }, open.live.map(pageRow)),
        facets ? null : archiveFold(open.archived, open.live.length),
      ])
    }

    // The collections themselves.
    return h('section', { className: 'coll' }, [
      h('h2', { key: 'h' }, '🗂 Collections'),
      model.collections.length === 0
        ? h('div', { key: 'e' }, [
            h('p', { key: 'p', className: 'coll-muted' }, t('No collection declared yet.')),
            h(
              'button',
              {
                key: 'a',
                className: 'coll-back',
                // Declared by writing a page, which is why the button asks
                // rather than opening a form: the declaration IS content.
                onClick: () =>
                  api.ask(
                    'Crée une collection : une page avec type: collection, un titre, `of:` le type de page collecté et `groupBy:` la facette de regroupement.',
                  ),
              },
              t('＋ Ask for a collection'),
            ),
          ])
        : h(
            'ul',
            { key: 'l', className: 'coll-cards' },
            model.collections.map((collection) =>
              h(
                'li',
                { key: collection.id },
                h(
                  'button',
                  {
                    className: 'coll-card',
                    onClick: () => setAt({ collection: collection.id, facet: null }),
                  },
                  [
                    h('span', { key: 'i', className: 'coll-card__icon' }, collection.icon),
                    h('span', { key: 'n', className: 'coll-card__name' }, collection.title),
                    h(
                      'span',
                      { key: 'c', className: 'coll-muted' },
                      // Live first, archived after: a collection whose work is
                      // all done reads as finished rather than as empty.
                      collection.problem ??
                        [
                          plural(collection.live.length, t('page')),
                          collection.archived.length > 0
                            ? archived(collection.archived.length)
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · '),
                    ),
                  ],
                ),
              ),
            ),
          ),
    ])
  }

  /**
   * What the tile says: how many ways in there are, and whether any of them
   * is broken.
   *
   * A collection declaring no `of:` gathers nothing — it looks like an empty
   * screen rather than like a mistake, so the tile is where it gets noticed.
   */
  async function tileInfo() {
    const response = await api.fetch('/api/pages/index')
    if (!response.ok) return undefined
    const { entries } = await response.json()
    const { collections } = buildCollections(entries)
    if (collections.length === 0) return undefined

    const broken = collections.filter((collection) => collection.problem).length
    return {
      chips: [
        { text: plural(collections.length, t('collection')) },
        ...(broken > 0 ? [{ text: `${broken} ${t('incomplete')}`, hot: true }] : []),
      ],
    }
  }

  return { component: Collections, tileInfo }
}
