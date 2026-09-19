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

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { forgetContributedBlocks, registerBlocks, validateDocument, parse, serialize } from '@antorfr/adestia-content'

import { Editor } from '../src/editor/Editor.js'
import { Reader } from '../src/editor/Reader.js'

const PAGES = [
  {
    path: 'chantiers/adestia/socle.md',
    fields: { title: 'Socle de contenu', status: 'en cours', type: 'chantier' },
    blocks: { etat: 'Huit lots sur treize ; le parseur tient.', perimetre: 'Hors infra.' },
  },
  { path: 'chantiers/adestia/editeur.md', fields: { title: 'Éditeur de blocs', status: 'en cours', type: 'chantier' } },
  { path: 'chantiers/adestia/tours.md', fields: { title: 'Les tours', status: 'clos', ico: '🌀' } },
  { path: 'chantiers/adestia/profond/loin.md', fields: { title: 'Plus bas' } },
  { path: 'chantiers/adestia/v1.md', fields: { title: 'v1.0', type: 'jalon' } },
  { path: 'chantiers/adestia/note.md', fields: { title: 'Note de lecture' } },
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
  it('met la section dans une carte en `frame=card`, et pas autrement', () => {
    // « Une vision plus structurée en bloc » : la même section, encadrée, pour
    // qu'une page de plusieurs se lise comme des blocs et non comme une seule
    // colonne de prose. La section porte la carte elle-même, puisqu'elle
    // dessine son propre en-tête — qui devient le bandeau.
    const { container } = render(
      <Reader
        markdown={':::content{type=perimetre frame=card}\nDu texte.\n:::\n'}
        path={HERE}
        pages={PAGES}
      />,
    )
    const section = container.querySelector('.adestia-content')
    expect(section?.classList.contains('adestia-framed')).toBe(true)
    expect(section?.querySelector(':scope > .adestia-head')?.textContent).toContain('Perimetre')
    // La boîte ne remplace rien : le sujet, le titre et la prose restent.
    expect(screen.getByText('Perimetre')).toBeTruthy()
    expect(screen.getByText('Du texte.')).toBeTruthy()
  })

  it('reste en prose sans le dire', () => {
    const { container } = render(
      <Reader markdown={':::content{type=perimetre}\nDu texte.\n:::\n'} path={HERE} pages={PAGES} />,
    )
    expect(container.querySelector('.adestia-framed')).toBeNull()
  })

  it('ne connaît plus `view` : une section encadrée s’écrit `frame=card`', () => {
    // Pas de seconde orthographe à entretenir : l'ancienne est un attribut
    // que la section n'a pas, signalé, et sans effet.
    const [issue] = validateDocument(parse(':::content{type=perimetre view=cards}\nDu texte.\n:::\n'))
    expect(issue?.severity).toBe('warning')
    expect(issue?.message).toContain('view')
  })

  it('garde son titre, son icône et sa signature dans la boîte', () => {
    // Une boîte n'est pas un callout : un callout est un aparté sans sujet ni
    // signature, celle-ci est une SECTION encadrée et garde tout ce qu'elle a.
    render(
      <Reader
        markdown={':::content{type=synthese title="Synthèse" ico=📋 by=Antor on=2026-09-10 frame=card}\nDu texte.\n:::\n'}
        path={HERE}
        pages={PAGES}
      />,
    )
    expect(screen.getByText('Synthèse')).toBeTruthy()
    expect(screen.getByText('📋')).toBeTruthy()
    expect(screen.getByText('Antor · 2026-09-10')).toBeTruthy()
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

  it('coupe la ligne sur `:::row`, sans rien dessiner', () => {
    // Un `2/3` puis un `1/3` partagent une ligne. `:::row` entre les deux
    // envoie le second à la ligne suivante — où il retrouve un `2/3` — et
    // ne laisse aucune trace dans la page, là où un `---` tracerait un trait.
    const { container } = render(
      <Reader
        markdown={
          ':::content{type=a w=2/3}\nUn.\n:::\n\n:::row\n:::\n\n' +
          ':::content{type=b w=1/3}\nDeux.\n:::\n\n:::content{type=c w=2/3}\nTrois.\n:::\n'
        }
      />,
    )
    const rows = [...container.querySelectorAll('.adestia-row')]
    expect(rows.map((row) => row.querySelectorAll(':scope > .adestia-row__cell').length)).toEqual([1, 2])
    expect(container.querySelector('hr')).toBeNull()
    expect(container.querySelector('.adestia-unknown-block')).toBeNull()
    expect(container.textContent).not.toContain('row')
  })

  it('accepte `:::row` vide, et refuse qu’on y mette quelque chose', () => {
    expect(validateDocument(parse(':::row\n:::\n'))).toEqual([])
    // Et l'enregistrement le rend tel qu'il est venu.
    expect(serialize(parse(':::row\n:::\n'))).toBe(':::row\n:::\n')
    const [issue] = validateDocument(parse(':::row\nDu texte.\n:::\n'))
    expect(issue?.severity).toBe('error')
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

  it('prend ses lignes dans son CORPS quand il en a un', () => {
    // Une déclaration de rôles ne se dérive de rien : quelqu'un la décide.
    // C'est écrit, et c'est quand même une liste — pas de la prose.
    render(
      <Reader
        markdown={':::list\n- PM: Machine\n- BA: Truc\n:::\n'}
        path={HERE}
        pages={PAGES}
      />,
    )
    expect(screen.getByText('Machine')).toBeTruthy()
    expect(screen.getByText('PM')).toBeTruthy()
    // Et il n'a pas interrogé l'index par-dessus les lignes écrites.
    expect(screen.queryByText('Socle de contenu')).toBeNull()
  })

  it('ne fait rien ouvrir d’une ligne écrite — il n’y a pas de page derrière', () => {
    const { container } = render(
      <Reader markdown={':::list\n- PM: Machine\n:::\n'} path={HERE} pages={PAGES} />,
    )
    expect(container.querySelectorAll('button.adestia-list__row')).toHaveLength(0)
  })

  it('dessine des pastilles à initiales en `view=chips`', () => {
    const { container } = render(
      <Reader
        markdown={':::list{view=chips}\n- arbitrage: Antor Berard\n- veille: Nestor\n:::\n'}
        path={HERE}
        pages={PAGES}
      />,
    )
    const plates = [...container.querySelectorAll('.adestia-chip__plate')].map((p) => p.textContent)
    // Dérivées, jamais déclarées : ce produit n'a pas d'annuaire, et demander
    // à une page d'écrire les initiales à côté du nom, c'est lui demander de
    // tenir deux choses en accord.
    expect(plates).toEqual(['AB', 'N'])
    expect(screen.getByText('Antor Berard')).toBeTruthy()
    expect(screen.getByText('· arbitrage')).toBeTruthy()
  })

  it('donne aux pages une grille en `view=cards`', () => {
    const { container } = render(
      <Reader markdown={':::list{view=cards}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    expect(container.querySelector('.adestia-list--cards')).toBeTruthy()
    expect(screen.getByText('Socle de contenu')).toBeTruthy()
  })

  it('remonte ce que l’enfant DIT de lui, avec `pull=content:etat`', () => {
    // La question à laquelle l'entête ne savait pas répondre : « où en est
    // chaque sous-chantier » est écrit dans le CORPS de l'enfant. L'index en
    // publie un digest borné, donc la ligne le montre sans une requête par
    // enfant.
    render(
      <Reader markdown={':::list{pull=content:etat}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    expect(screen.getByText('Huit lots sur treize ; le parseur tient.')).toBeTruthy()
  })

  it('met la phrase SOUS le titre, jamais dans une puce', () => {
    // Une puce est faite pour un statut ou une date ; un paragraphe qu'on y
    // comprime est un paragraphe que personne ne lit.
    const { container } = render(
      <Reader markdown={':::list{pull=status,content:etat}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    const said = container.querySelector('.adestia-list__said')
    expect(said?.textContent).toBe('Huit lots sur treize ; le parseur tient.')
    // `status` reste une puce : deux sortes de remontée, deux dessins.
    const chips = [...container.querySelectorAll('.adestia-tag')].map((c) => c.textContent)
    expect(chips).toContain('en cours')
    expect(chips).not.toContain('Huit lots sur treize ; le parseur tient.')
  })

  it('ne montre rien quand l’enfant ne porte pas ce bloc', () => {
    const { container } = render(
      <Reader markdown={':::list{pull=content:absent}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    expect(container.querySelector('.adestia-list__said')).toBeNull()
  })

  it('porte le glyphe que l’enfant s’est donné, et sinon celui de la coque', () => {
    // Rien n'est inventé ici : `ico:` est le champ que lisent déjà les tuiles
    // et les cartes de section, et les deux replis — ◆ pour un sujet, • pour
    // une page — sont les mots que la coque emploie ailleurs. La forme dit
    // donc quelque chose de vrai : descend-on dedans, ou l'ouvre-t-on ?
    const { container } = render(
      <Reader markdown={':::list{closed=show}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    const rows = [...container.querySelectorAll('.adestia-list__row')]
    const glyph = (titre: string) =>
      rows
        .find((row) => row.querySelector('.adestia-list__title')?.textContent?.startsWith(titre))
        ?.querySelector('.adestia-list__ico')?.textContent
    expect(glyph('Les tours')).toBe('🌀')
    expect(glyph('Socle de contenu')).toBe('•')
  })

  it('marque d’un losange la ligne qui tient pour un DOSSIER', () => {
    const pages = [
      ...PAGES,
      { path: 'chantiers/adestia/editeur/INDEX.md', fields: { title: 'Éditeur' } },
    ]
    const { container } = render(
      <Reader markdown={':::list{depth=children}\n:::\n'} path={HERE} pages={pages} />,
    )
    const row = [...container.querySelectorAll('.adestia-list__row')].find((r) =>
      r.querySelector('.adestia-list__title')?.textContent?.startsWith('Éditeur'),
    )
    expect(row?.querySelector('.adestia-list__ico')?.textContent).toBe('◆')
  })

  it('garde le type demandé, et laisse le reste où il est', () => {
    // `depth` dit jusqu'où regarder, `type` dit quoi garder — et les deux sont
    // nécessaires : le dossier d'un chantier contient ses sous-chantiers ET
    // les notes posées à côté. Sans ce filtre, la liste mélange les deux.
    render(<Reader markdown={':::list{type=chantier}\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.getByText('Socle de contenu')).toBeTruthy()
    expect(screen.queryByText('Note de lecture')).toBeNull()
    expect(screen.queryByText('v1.0')).toBeNull()
  })

  it('en accepte plusieurs, séparés par des virgules', () => {
    render(<Reader markdown={':::list{type=chantier,jalon}\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.getByText('Socle de contenu')).toBeTruthy()
    expect(screen.getByText('v1.0')).toBeTruthy()
    expect(screen.queryByText('Note de lecture')).toBeNull()
  })

  it('sans `type`, remonte tout ce que la position donne', () => {
    render(<Reader markdown={':::list\n:::\n'} path={HERE} pages={PAGES} />)
    expect(screen.getByText('Note de lecture')).toBeTruthy()
    expect(screen.getByText('Socle de contenu')).toBeTruthy()
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

  it('s’applique aussi à une page ORDINAIRE, telle que l’éditeur la monte', () => {
    // Le 09/09, `vocabulary` a été passé DEUX fois au lecteur des pages à
    // mise en page et zéro fois à celui des pages ordinaires : partout
    // ailleurs que sous une mise en page, la résolution retombait sur le cœur,
    // et une surcharge d'app n'y était jamais dessinée. Latent tant qu'aucune
    // app ne surcharge un bloc du cœur ; c'est la première qui le ferait qui
    // l'aurait découvert.
    surcharge()
    render(
      <Editor
        page={{
          path: 'chantiers/adestia/INDEX.md',
          title: 'Adestia',
          markdown: TABLEAU,
          revision: '1-1',
          editable: true,
          diagnostics: [],
        }}
        attachments={false}
        vocabulary={{ owner: 'projets', features: [] }}
        blocks={{ projets: { table: Grave } }}
      />,
    )
    expect(screen.getByTestId('table-projets')).toBeTruthy()
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

describe('titre et icône sur TOUS les blocs', () => {
  // Signalé à l'usage : `:::list{title=…}` s'enregistrait avec un simple
  // avertissement et s'affichait sans son titre. `title` et `ico` sont
  // désormais réservés, comme `w` : le lecteur dessine l'en-tête pour n'importe
  // quel bloc, et seule sa PLACE varie — dans la boîte de ceux qui en ont une,
  // au-dessus des autres.
  it('ne fait plus avertir le validateur, sur aucun bloc', () => {
    const page =
      ':::list{title="Sous-projets" ico=🧱}\n:::\n\n' +
      ':::figures{title="En chiffres"}\n- Pièces: 9\n:::\n\n' +
      ':::table{title="Débit" ico=📐}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n\n' +
      ':::callout{type=tip title="Astuce"}\nCorps.\n:::\n'
    expect(validateDocument(parse(page))).toEqual([])
  })

  it('pose le titre d’une liste AU-DESSUS, et en bandeau dans une carte', () => {
    const { container, unmount } = render(
      <Reader markdown={':::list{title="Sous-projets" ico=🧱}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    const above = container.querySelector('.adestia-titled > .adestia-head')
    expect(above?.textContent).toContain('Sous-projets')
    expect(above?.textContent).toContain('🧱')
    expect(container.querySelector('.adestia-framed')).toBeNull()
    unmount()

    const carded = render(
      <Reader markdown={':::list{title="Sous-projets" frame=card}\n:::\n'} path={HERE} pages={PAGES} />,
    )
    const card = carded.container.querySelector('.adestia-framed')
    expect(card?.querySelector(':scope > .adestia-head')?.textContent).toBe('Sous-projets')
    expect(card?.querySelector(':scope > .adestia-list--rows')).toBeTruthy()
  })

  it('pose le titre AU-DESSUS d’une liste qui n’a pas de boîte', () => {
    const { container } = render(
      <Reader markdown={':::list{title="Les gens" view=chips}\n- PM: Machine\n:::\n'} />,
    )
    expect(container.querySelector('.adestia-titled > .adestia-head')?.textContent).toBe('Les gens')
    expect(container.querySelector('.adestia-titled > .adestia-list--chips')).toBeTruthy()
  })

  it('titre les chiffres et le tableau par-dessus', () => {
    const { container } = render(
      <Reader
        markdown={
          ':::figures{title="En chiffres"}\n- Pièces: 9\n:::\n\n' +
          ':::table{title="Débit"}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n'
        }
      />,
    )
    const heads = [...container.querySelectorAll('.adestia-titled > .adestia-head')].map((one) => one.textContent)
    expect(heads).toEqual(['En chiffres', 'Débit'])
    expect(container.querySelector('.adestia-titled > .adestia-figures')).toBeTruthy()
    expect(container.querySelector('.adestia-titled > .adestia-tableblock')).toBeTruthy()
  })

  it('met le titre d’un encadré DANS l’encadré', () => {
    const { container } = render(<Reader markdown={':::callout{type=tip title="Astuce"}\nCorps.\n:::\n'} />)
    expect(container.querySelector('.adestia-callout > .adestia-head')?.textContent).toBe('Astuce')
  })

  it('titre aussi le bloc d’un plugin, sans que le plugin ait rien à apprendre', () => {
    registerBlocks(
      { chrono: { content: 'empty', description: 'une frise' } },
      { plugin: 'frises', kind: 'feature' },
    )
    try {
      const Frise = () => <div data-testid="frise" />
      const { container } = render(
        <Reader
          markdown={':::chrono{title="Planning" ico=🗓️}\n:::\n'}
          vocabulary={{ features: ['frises'] }}
          blocks={{ frises: { chrono: Frise } }}
        />,
      )
      expect(screen.getByTestId('frise')).toBeTruthy()
      expect(container.querySelector('.adestia-titled > .adestia-head')?.textContent).toContain('Planning')
    } finally {
      forgetContributedBlocks()
    }
  })

  it('laisse nu un bloc qui ne demande rien', () => {
    const { container } = render(<Reader markdown={':::figures\n- Pièces: 9\n:::\n'} />)
    expect(container.querySelector('.adestia-head')).toBeNull()
    expect(container.querySelector('.adestia-titled')).toBeNull()
  })
})

describe(':::list{source=files}', () => {
  // La bande « Fichiers joints » sous la page, mais placée où l'auteur le
  // veut : dans une rangée, sous un titre, filtrée. Mêmes fichiers, même règle
  // — celle du serveur, `/api/files?page=…`.
  const FICHIERS = [
    { path: 'chantiers/adestia/plan.pdf', name: 'plan.pdf', bytes: 412_000, modified: '2026-09-10T10:00:00Z', kind: 'pdf' },
    { path: 'chantiers/adestia/assets/avant.jpg', name: 'avant.jpg', bytes: 2_300_000, modified: '2026-09-17T10:00:00Z', kind: 'image' },
    { path: 'chantiers/adestia/debit.csv', name: 'debit.csv', bytes: 900, modified: '2026-09-12T10:00:00Z', kind: 'text' },
  ]
  const answering = (files: unknown, ok = true) => {
    const asked: string[] = []
    const fetchImpl = ((url: string) => {
      asked.push(url)
      return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve({ files }) } as unknown as Response)
    }) as unknown as typeof fetch
    return { fetchImpl, asked }
  }

  it('est accepté par le vocabulaire, et `source` reste fermé', () => {
    expect(validateDocument(parse(':::list{source=files type=pdf sort=modified view=cards}\n:::\n'))).toEqual([])
    const [issue] = validateDocument(parse(':::list{source=depot}\n:::\n'))
    expect(issue?.message).toContain('children, files')
  })

  it('liste les fichiers de la page, qui s’ouvrent dans un onglet', async () => {
    const { fetchImpl, asked } = answering(FICHIERS)
    const { container } = render(
      <Reader markdown={':::list{source=files title="Documents"}\n:::\n'} path={HERE} fetchImpl={fetchImpl} locale="fr" />,
    )
    await waitFor(() => expect(screen.getByText('plan.pdf')).toBeTruthy())
    expect(asked).toEqual([`/api/files?page=${encodeURIComponent(HERE)}`])
    const link = screen.getByText('plan.pdf').closest('a')
    expect(link?.getAttribute('href')).toBe('/api/files/chantiers/adestia/plan.pdf')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(screen.getByText('412 kB')).toBeTruthy()
    // Le titre, dans la boîte comme pour une liste de pages.
    expect(container.querySelector('.adestia-titled > .adestia-head')?.textContent).toBe('Documents')
  })

  it('garde les sortes nommées, et met le plus récent devant', async () => {
    const { fetchImpl } = answering(FICHIERS)
    const { container } = render(
      <Reader markdown={':::list{source=files type=pdf,image sort=modified}\n:::\n'} path={HERE} fetchImpl={fetchImpl} />,
    )
    await waitFor(() => expect(screen.getByText('avant.jpg')).toBeTruthy())
    const names = [...container.querySelectorAll('.adestia-list__title')].map((one) => one.textContent)
    expect(names).toEqual(['avant.jpg', 'plan.pdf'])
  })

  it('fait une planche en `view=cards` : la photo pour une image, le glyphe sinon', async () => {
    const { fetchImpl } = answering(FICHIERS)
    const { container } = render(
      <Reader markdown={':::list{source=files view=cards}\n:::\n'} path={HERE} fetchImpl={fetchImpl} />,
    )
    await waitFor(() => expect(screen.getByText('avant.jpg')).toBeTruthy())
    const thumbs = [...container.querySelectorAll('.adestia-list__thumb')]
    expect(thumbs.length).toBe(3)
    expect(container.querySelector('.adestia-list__thumb img')?.getAttribute('src')).toBe(
      '/api/files/chantiers/adestia/assets/avant.jpg',
    )
  })

  it('descend sous le dossier avec `depth=subtree`', async () => {
    const { fetchImpl, asked } = answering([])
    render(<Reader markdown={':::list{source=files depth=subtree}\n:::\n'} path={HERE} fetchImpl={fetchImpl} />)
    await waitFor(() => expect(screen.getByText('Aucun fichier ici.')).toBeTruthy())
    expect(asked).toEqual(['/api/files?under=chantiers%2Fadestia'])
  })

  it('DIT qu’il n’a pas pu lister, et qu’il lui faut une page', async () => {
    const { fetchImpl } = answering([], false)
    const { unmount } = render(<Reader markdown={':::list{source=files}\n:::\n'} path={HERE} fetchImpl={fetchImpl} />)
    await waitFor(() => expect(screen.getByText(/n’ont pas pu être listés/)).toBeTruthy())
    unmount()
    render(<Reader markdown={':::list{source=files}\n:::\n'} />)
    expect(screen.getByText(/a besoin de la page/)).toBeTruthy()
  })

  it('laisse des lignes ÉCRITES être écrites, quoi que dise `source`', () => {
    render(<Reader markdown={':::list{source=files}\n- PM: Machine\n:::\n'} path={HERE} />)
    expect(screen.getByText('Machine')).toBeTruthy()
  })
})

describe('`frame=card`, sur n’importe quel bloc', () => {
  // Le cadre est dessiné par le LECTEUR, comme le titre : n'importe quel bloc,
  // du cœur ou d'un plugin, porte la carte d'une section, bandeau compris,
  // sans que son rendu ait rien à dessiner ni rien à déclarer. Et sans lui,
  // un bloc est NU — une liste en lignes ne s'encadre plus toute seule.
  afterEach(() => forgetContributedBlocks())

  it('encadre le bloc d’un plugin, le titre en bandeau, sans rien déclarer', () => {
    registerBlocks(
      { chrono: { content: 'empty', description: 'une frise' } },
      { plugin: 'frises', kind: 'feature' },
    )
    const Frise = () => <div data-testid="frise" />
    const { container } = render(
      <Reader
        markdown={':::chrono{frame=card title="Planning" ico=🗓️}\n:::\n'}
        vocabulary={{ features: ['frises'] }}
        blocks={{ frises: { chrono: Frise } }}
      />,
    )
    const card = container.querySelector('.adestia-framed')
    expect(card?.querySelector(':scope > .adestia-head')?.textContent).toContain('Planning')
    expect(card?.querySelector('[data-testid="frise"]')).toBeTruthy()
    expect(container.querySelector('.adestia-titled')).toBeNull()
  })

  it('encadre les blocs du cœur de la même façon', () => {
    const { container } = render(
      <Reader
        markdown={
          ':::figures{frame=card}\n- Pièces: 9\n:::\n\n' +
          ':::table{frame=card}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n\n' +
          ':::callout{type=tip frame=card title="Astuce"}\nCorps.\n:::\n'
        }
      />,
    )
    const cards = [...container.querySelectorAll('.adestia-framed')]
    expect(cards.map((one) => one.lastElementChild?.className)).toEqual([
      'adestia-figures',
      'adestia-table-scroll adestia-tableblock',
      'adestia-callout adestia-callout--tip',
    ])
    // Encadré, le titre d'un aparté est le bandeau de la carte, plus sa
    // première ligne.
    expect(cards[2]?.querySelector(':scope > .adestia-head')?.textContent).toBe('Astuce')
    expect(cards[2]?.querySelector('.adestia-callout > .adestia-head')).toBeNull()
  })

  it('laisse une liste nue quand rien ne le demande', () => {
    const { container } = render(<Reader markdown={':::list\n:::\n'} path={HERE} pages={PAGES} />)
    expect(container.querySelector('.adestia-list--rows')).toBeTruthy()
    expect(container.querySelector('.adestia-framed')).toBeNull()
  })

  it('n’accepte que `card`, comme `w` n’accepte que ses fractions', () => {
    expect(validateDocument(parse(':::list{frame=card}\n:::\n'))).toEqual([])
    const [issue] = validateDocument(parse(':::list{frame=cards}\n:::\n'))
    expect(issue?.severity).toBe('error')
    expect(issue?.message).toContain('card')
  })
})
