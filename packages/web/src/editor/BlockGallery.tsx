/**
 * The block gallery (E-34): a sheet of cards, searched, grouped, chosen by
 * click or by arrows and Enter. It lists; it does not insert — `onChoose` is
 * told the block's name and the editor writes it at the insertion point.
 */

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { Icon } from '../app/Icon.js'
import { Segmented, Sheet } from '../app/ui/index.js'
import { VariantImage } from './VariantImage.js'
import type { GalleryCard } from './gallery.js'

export interface BlockGalleryProps {
  readonly open: boolean
  readonly cards: readonly GalleryCard[]
  /** `view` is the variant chosen on the card, and only when it is not the block's default. */
  readonly onChoose: (name: string, view?: string) => void
  readonly onClose: () => void
  readonly t: (key: string) => string
}

/** Lower case, accents off: "chiffres" finds "Chiffres", "encadre" finds "Encadré". */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function BlockGallery({ open, cards, onChoose, onClose, t }: BlockGalleryProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  // The variant picked on each card; a card nobody touched inserts its default, written as nothing.
  const [picked, setPicked] = useState<Readonly<Record<string, string>>>({})
  const choose = (card: GalleryCard) => {
    const view = picked[card.id]
    if (card.view && view && view !== card.view.default && card.view.values.includes(view)) onChoose(card.id, view)
    else onChoose(card.id)
  }

  const shown = useMemo(() => {
    const needle = fold(query.trim())
    return needle === ''
      ? cards
      : cards.filter((card) => fold(`${card.name} ${card.line} ${card.id}`).includes(needle))
  }, [cards, query])

  const groups = useMemo(() => {
    const byGroup = new Map<string, GalleryCard[]>()
    for (const card of shown) byGroup.set(card.group, [...(byGroup.get(card.group) ?? []), card])
    return [...byGroup.entries()]
  }, [shown])
  // Arrows walk the cards in the order they are drawn: group by group.
  const ordered = groups.flatMap(([, members]) => members)
  const current = Math.min(active, Math.max(ordered.length - 1, 0))

  const move = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      setActive(Math.min(current + 1, ordered.length - 1))
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setActive(Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      const card = ordered[current]
      if (card) {
        event.preventDefault()
        choose(card)
      }
    }
  }

  return (
    <Sheet open={open} title={t('Add block')} onClose={onClose} className="adestia-gallery-sheet" t={t}>
      <div className="adestia-blockgallery" onKeyDown={move}>
        <input
          type="search"
          className="adestia-input adestia-blockgallery__search"
          placeholder={t('Search a block…')}
          aria-label={t('Search a block…')}
          value={query}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
        />
        {ordered.length === 0 ? (
          <div className="adestia-blockgallery__empty" role="status">
            <Icon name="search" />
            <p>{t('No block called "%q"').replace('%q', query.trim())}</p>
            <p className="adestia-blockgallery__hint">{t('Try "timeline", or clear the search to browse everything.')}</p>
          </div>
        ) : (
          <div ref={list} role="listbox" aria-label={t('Add block')} className="adestia-blockgallery__list">
            {groups.map(([group, members]) => (
              <section key={group} className="adestia-blockgallery__group">
                <h3 className="adestia-blockgallery__group-title">{group}</h3>
                <div className="adestia-blockgallery__cards">
                  {members.map((card) => (
                    <div
                      key={card.id}
                      className={`adestia-blockcell${ordered[current]?.id === card.id ? ' adestia-blockcell--active' : ''}`}
                      onMouseEnter={() => setActive(ordered.indexOf(card))}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={ordered[current]?.id === card.id}
                        aria-label={card.name}
                        className="adestia-blockcard"
                        onClick={() => choose(card)}
                      >
                        {card.image ? (
                          <img className="adestia-blockcard__image" src={card.image} alt="" />
                        ) : (
                          <span className="adestia-blockcard__image adestia-blockcard__image--none" aria-hidden="true">
                            <Icon name="chart-column" />
                          </span>
                        )}
                        <span className="adestia-blockcard__name">{card.name}</span>
                        {card.line && <span className="adestia-blockcard__line">{card.line}</span>}
                      </button>
                      {card.view && (
                        // The same pictures as E-6. Arrows here choose a variant, not another card.
                        <div
                          className="adestia-blockcell__views"
                          onFocus={() => setActive(ordered.indexOf(card))}
                          onKeyDown={(event) => {
                            if (event.key.startsWith('Arrow')) event.stopPropagation()
                          }}
                        >
                          <Segmented
                            kind="image"
                            label={t('Look')}
                            value={picked[card.id] ?? card.view.default}
                            choices={card.view.values.map((value) => ({ value, label: t(value), image: <VariantImage name={value} /> }))}
                            onChange={(value) => setPicked((all) => ({ ...all, [card.id]: value }))}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
