// @vitest-environment jsdom
/**
 * The reader's markup, pinned. The snapshot was taken from the monolithic
 * Reader before it was split by kind of block; the split must not move it.
 */
import { act, cleanup, render } from '@testing-library/react'
import { expect, it } from 'vitest'

import { Reader } from '../src/editor/Reader.js'

const pages = [
  { path: 'chantiers/adestia/socle.md', fields: { title: 'Socle', status: 'en cours', type: 'chantier' }, blocks: { etat: 'Huit lots.' } },
  { path: 'chantiers/adestia/tours.md', fields: { title: 'Les tours', status: 'clos', ico: '🌀' } },
  { path: 'chantiers/adestia/INDEX.md', fields: { title: 'Adestia' } },
]
const files = [
  { path: 'chantiers/adestia/assets/photo.png', name: 'photo.png', bytes: 1024, kind: 'image', modified: '2026-10-17' },
  { path: 'chantiers/adestia/plan.pdf', name: 'plan.pdf', bytes: 4000, kind: 'pdf', modified: '2026-10-16' },
]
const fetchImpl = (async () => new Response(JSON.stringify({ files }))) as typeof fetch

const seeds: Record<string, string> = {
  prose: '# Titre\n\nUn **gras**, un [[tours]] et une liste :\n\n- un\n- deux\n',
  content: ':::content{type=perimetre}\nLe socle, hors infra.\n:::\n',
  contentCard: ':::content{type=synthese title="Synthèse" ico=📋 by=Antor on=2026-09-10 frame=card}\nTexte.\n:::\n',
  figures: ':::figures\n- Avancement: 62 % — 8 lots sur 13\n- Jalon: 12 sept.\n:::\n',
  table: ':::table\n| Fournisseur | Prix |\n|---|---|\n| Dispano | 412 |\n:::\n',
  list: ':::list{type=chantier}\n:::\n',
  files: ':::files\n:::\n',
  rows: ':::content{type=a w=2/3}\nUn.\n:::\n\n:::row\n:::\n\n:::content{type=b w=1/3}\nDeux.\n:::\n\n:::content{type=c w=2/3}\nTrois.\n:::\n',
  mixed: ':::list{w=2/3}\n:::\n\n:::content{type=perimetre w=1/3}\nDu texte.\n:::\n\n:::files\n:::\n\n:::figures\n- Un: 1\n:::\n',
  unknown: ':::mystery\nx\n:::\n',
}

for (const [name, markdown] of Object.entries(seeds)) {
  for (const context of [false, true]) {
    it(`renders ${name} ${context ? 'in a page' : 'alone'} unchanged`, async () => {
      const props = context
        ? { path: 'chantiers/adestia/INDEX.md', store: 'famille', fields: { type: 'chantier' }, pages }
        : {}
      const view = render(<Reader markdown={markdown} fetchImpl={fetchImpl} {...props} />)
      await act(async () => {})
      await expect(view.container.innerHTML).toMatchFileSnapshot(`./__snapshots__/reader-markup/${name}-${context ? 'page' : 'alone'}.html`)
      cleanup()
    })
  }
}
