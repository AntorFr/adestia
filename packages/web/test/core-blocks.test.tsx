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

import type { ReactNode } from 'react'

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { forgetContributedBlocks, registerBlocks, validateDocument, parse } from '@antorfr/adestia-content'

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

describe(':::table', () => {
  it('dessine le tableau, et le fait défiler dans sa propre boîte', () => {
    // Le bloc sans test était le bloc dont la doc mentait. Celui-ci dit ce que
    // le cœur fait — et rien de plus.
    const { container } = render(
      <Reader markdown={':::table\n| Fournisseur | Prix |\n|---|---|\n| Dispano | 412 € |\n:::\n'} />,
    )
    expect(container.querySelector('.adestia-tableblock')).toBeTruthy()
    expect(screen.getByText('Dispano')).toBeTruthy()
    expect(screen.getByText('412 €')).toBeTruthy()
  })

  it('n’invente aucun ton sur la première colonne', () => {
    // Ce que le cœur NE fait PAS, épinglé exprès : une gravité `moyen` n'a de
    // sens que sur un registre de risques, et le cœur n'a pas de domaine. Un
    // plugin qui en veut une surcharge ce bloc.
    const { container } = render(
      <Reader markdown={':::table\n| Gravité | Risque |\n|---|---|\n| Moyen | Le CLI bouge |\n:::\n'} />,
    )
    expect(container.querySelector('.adestia-stat')).toBeNull()
  })

  it('ne prend aucun attribut', () => {
    const [issue] = validateDocument(parse(':::table{type=risques}\n| a | b |\n|---|---|\n:::\n'))
    expect(issue?.message).toContain('type')
  })
})

describe('`w` sur ces blocs', () => {
  it('met deux blocs sur une ligne, quelle que soit leur nature', () => {
    // `w` ne se déclare dans aucune spec, donc rien ne garantit par
    // construction qu'il marche sur un bloc neuf. Le banc l'a montré ; ceci
    // l'épingle, parce qu'un bandeau qui se casse ne casse rien d'autre et
    // passe donc inaperçu.
    const { container } = render(
      <Reader
        markdown={':::list{w=2/3}\n:::\n\n:::content{type=perimetre w=1/3}\nDu texte.\n:::\n'}
        path={HERE}
        pages={PAGES}
      />,
    )
    const row = container.querySelector('.adestia-row')
    expect(row).toBeTruthy()
    expect(row?.querySelectorAll('.adestia-row__cell').length).toBe(2)
  })

  it('laisse un bloc pleine largeur hors des bandes', () => {
    const { container } = render(
      <Reader markdown={':::content{type=synthese}\nSeul.\n:::\n'} path={HERE} pages={PAGES} />,
    )
    expect(container.querySelector('.adestia-row')).toBeNull()
  })
})

describe(':::list', () => {
  it('liste les pages sous celle-ci, sans son propre index', () => {
    render(<Reader markdown={':::list{source=children}\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.getByText('Socle de contenu')).toBeTruthy()
    expect(screen.getByText('Éditeur de blocs')).toBeTruthy()
    expect(screen.queryByText('Adestia')).toBeNull()
  })

  it('replie ce qui est clos plutôt que de le cacher', () => {
    // Un chantier fini est exactement ce qu'on ouvre pour voir comment le
    // précédent s'est passé : caché il est perdu, replié il est à un clic.
    render(<Reader markdown={':::list{source=children}\n:::\n'} path={HERE} pages={PAGES} />)
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

describe('la surcharge, de bout en bout', () => {
  // La règle du 09/09, vue depuis l'écran : un plugin redéfinit `table` pour
  // son domaine, et le MÊME markdown se dessine différemment selon où la page
  // est rangée. C'est toute la promesse — et son garde-fou : ailleurs que chez
  // lui, le cœur reprend la main.
  const TABLEAU = ':::table\n| Gravité | Risque |\n|---|---|\n| Moyen | Le CLI bouge |\n:::\n'
  const Grave = ({ children }: { children?: ReactNode }) => (
    <div data-testid="table-projets">{children}</div>
  )

  const surcharge = () =>
    registerBlocks(
      { table: { content: 'flow', description: 'un tableau à gravités' } },
      { plugin: 'projets', kind: 'app' },
    )

  afterEach(() => forgetContributedBlocks())

  it('donne au domaine le dessin de son app, et au reste le cœur', () => {
    surcharge()
    const { container, unmount } = render(
      <Reader
        markdown={TABLEAU}
        path="chantiers/adestia/INDEX.md"
        vocabulary={{ owner: 'projets', features: [] }}
        blocks={{ projets: { table: Grave } }}
      />,
    )
    expect(screen.getByTestId('table-projets')).toBeTruthy()
    expect(container.querySelector('.adestia-tableblock')).toBeNull()
    unmount()

    // La même page, hors du domaine : le cœur, sans une ligne de plus.
    const ailleurs = render(
      <Reader
        markdown={TABLEAU}
        path="recettes/lasagnes.md"
        vocabulary={{ features: [] }}
        blocks={{ projets: { table: Grave } }}
      />,
    )
    expect(ailleurs.container.querySelector('.adestia-tableblock')).toBeTruthy()
  })

  it('rend le tableau NU sur `from=core`, même chez le plugin', () => {
    surcharge()
    const { container } = render(
      <Reader
        markdown={':::table{from=core}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n'}
        path="chantiers/x.md"
        vocabulary={{ owner: 'projets', features: [] }}
        blocks={{ projets: { table: Grave } }}
      />,
    )
    expect(container.querySelector('.adestia-tableblock')).toBeTruthy()
    expect(screen.queryByTestId('table-projets')).toBeNull()
  })

  it('dit visiblement qu’un `from=` ne mène nulle part, et garde le corps', () => {
    const { container } = render(
      <Reader markdown={':::table{from=disparu}\n| a |\n|---|\n| gardé |\n:::\n'} />,
    )
    expect(container.querySelector('.adestia-block-note')?.textContent).toContain('disparu')
    expect(screen.getByText('gardé')).toBeTruthy()
  })
})

describe('titre et icône sur :::content', () => {
  it('affiche le titre écrit, accents compris, devant le sujet deviné', () => {
    // Le défaut vu au banc : « Perimetre », parce qu'un slug tenait lieu de
    // mot. L'échelle des tuiles s'applique : l'occurrence bat le deviné.
    render(
      <Reader markdown={':::content{type=perimetre title="Périmètre du lot" ico=📐}\nCorps.\n:::\n'} />,
    )
    expect(screen.getByText('Périmètre du lot')).toBeTruthy()
    expect(screen.getByText('📐')).toBeTruthy()
    expect(screen.queryByText('Perimetre')).toBeNull()
  })

  it('retombe sur le type embelli quand rien n’est déclaré', () => {
    render(<Reader markdown={':::content{type=perimetre}\nCorps.\n:::\n'} />)
    expect(screen.getByText('Perimetre')).toBeTruthy()
  })

  it('exige toujours le sujet, titre ou pas', () => {
    // `title=` est de l'affichage ; `type=` est ce que les requêtes, les
    // remontées et la config adressent. L'un ne remplace pas l'autre, et un
    // bloc qui a un titre mais plus de sujet est un bloc qui a perdu ce dont
    // il parlait.
    const [issue] = validateDocument(parse(':::content{title="Beau titre"}\nCorps.\n:::\n'))
    expect(issue?.message).toContain('type')
  })
})
