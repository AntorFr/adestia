// @vitest-environment jsdom
/**
 * Les quatre rendus génériques du cœur.
 *
 * Ce qu'ils garantissent tient en une phrase : un bloc ne mange jamais ce
 * qu'il ne comprend pas. Une ligne de `figures` sans deux-points reste une
 * tuile, une liste sans index le DIT au lieu de se dessiner vide, et un
 * `content` sans sujet est refusé par le validateur plutôt que de perdre en
 * silence ce dont il parlait.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { validateDocument, parse } from '@antorfr/adestia-content'

import { Reader } from '../src/editor/Reader.js'

const PAGES = [
  { path: 'chantiers/adestia/socle.md', fields: { title: 'Socle de contenu', status: 'en cours' } },
  { path: 'chantiers/adestia/editeur.md', fields: { title: 'Éditeur de blocs', status: 'en cours' } },
  { path: 'chantiers/adestia/tours.md', fields: { title: 'Les tours', status: 'clos' } },
  { path: 'chantiers/adestia/profond/loin.md', fields: { title: 'Plus bas' } },
  { path: 'chantiers/adestia/INDEX.md', fields: { title: 'Adestia' } },
]
const HERE = 'chantiers/adestia/INDEX.md'

describe(':::content', () => {
  it('titre le passage avec son sujet, et garde sa prose', () => {
    render(<Reader markdown={':::content{type=perimetre}\nLe socle, hors infra.\n:::\n'} />)
    expect(screen.getByText('Perimetre')).toBeTruthy()
    expect(screen.getByText('Le socle, hors infra.')).toBeTruthy()
  })

  it('refuse un bloc dont le sujet a disparu', () => {
    // La règle sur laquelle repose toute la doctrine : sans `type`, le bloc a
    // perdu ce dont il parlait, et ça doit se voir.
    const [issue] = validateDocument(parse(':::content\nDu texte.\n:::\n'))
    expect(issue?.message).toContain('type')
  })
})

describe(':::figures', () => {
  it('fait une tuile par ligne, chiffre puis libellé', () => {
    render(
      <Reader markdown={':::figures\n- Avancement: 62 % — 8 lots sur 13\n- Jalon: 12 sept.\n:::\n'} />,
    )
    expect(screen.getByText('62 %')).toBeTruthy()
    expect(screen.getByText('12 sept.')).toBeTruthy()
    expect(screen.getByText(/8 lots sur 13/)).toBeTruthy()
  })

  it('garde une ligne qui ne se découpe pas, au lieu de la perdre', () => {
    render(<Reader markdown={':::figures\n- Trois cent douze\n:::\n'} />)
    expect(screen.getByText('Trois cent douze')).toBeTruthy()
  })
})

describe(':::list', () => {
  it('liste les pages sous celle-ci, sans son propre index', () => {
    render(<Reader markdown={':::list{from=children}\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.getByText('Socle de contenu')).toBeTruthy()
    expect(screen.getByText('Éditeur de blocs')).toBeTruthy()
    expect(screen.queryByText('Adestia')).toBeNull()
  })

  it('replie ce qui est clos plutôt que de le cacher', () => {
    // Un chantier fini est exactement ce qu'on ouvre pour voir comment le
    // précédent s'est passé : caché il est perdu, replié il est à un clic.
    render(<Reader markdown={':::list{from=children}\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.getByText('1 page close')).toBeTruthy()
  })

  it('ne descend pas plus bas que `depth` ne le permet', () => {
    render(<Reader markdown={':::list{depth=children}\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.queryByText('Plus bas')).toBeNull()
    render(<Reader markdown={':::list{depth=subtree}\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.getByText('Plus bas')).toBeTruthy()
  })

  it('fait d’un sous-DOSSIER un enfant, par son index', () => {
    // Le cas que la première version ratait, et il n'est pas marginal : ce
    // produit range un sous-sujet dans un dossier. Une règle qui ne regarde
    // que les fichiers liste les notes en vrac d'un projet et manque tous ses
    // sous-projets.
    const arbre = [
      { path: 'chantiers/adestia/INDEX.md', fields: { title: 'Adestia' } },
      { path: 'chantiers/adestia/note.md', fields: { title: 'Une note' } },
      { path: 'chantiers/adestia/socle/INDEX.md', fields: { title: 'Socle' } },
      { path: 'chantiers/adestia/socle/detail.md', fields: { title: 'Un détail' } },
    ]
    render(<Reader markdown={':::list{depth=children}\n:::\n'} path={HERE} pages={arbre} />)
    expect(screen.getByText('Socle')).toBeTruthy()
    expect(screen.getByText('Une note')).toBeTruthy()
    // Le contenu du sous-dossier appartient au sous-dossier, pas à cette liste.
    expect(screen.queryByText('Un détail')).toBeNull()
    // Et la page qui porte le bloc ne se liste jamais elle-même.
    expect(screen.queryByText('Adestia')).toBeNull()
  })

  it('remonte les champs d’entête demandés, et rien d’autre', () => {
    render(
      <Reader markdown={':::list{pull=status,absent}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    expect(screen.getAllByText('en cours').length).toBe(2)
  })

  it('ouvre la page sur laquelle on clique', () => {
    const openPage = vi.fn()
    render(
      <Reader markdown={':::list{}\n:::\n'} path={HERE} pages={PAGES} openPage={openPage} />,
    )
    screen.getByText('Socle de contenu').click()
    expect(openPage).toHaveBeenCalledWith('chantiers/adestia/socle.md')
  })

  it('DIT qu’il lui manque l’index, au lieu de se dessiner vide', () => {
    // Une liste vide se lit « ce dossier ne contient rien », ce qui est un
    // mensonge quand la vérité est « je n’ai pas pu regarder ».
    render(<Reader markdown={':::list{}\n:::\n'} path={HERE} />)
    expect(screen.getByText(/index des pages/)).toBeTruthy()
  })
})
