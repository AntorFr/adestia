/**
 * The piece count agrees with the instance's language (AD-24 b, E-25):
 * French says « 0 pièce », « 1 pièce », « 2 pièces »; English says
 * « 0 pieces », « 1 piece », « 2 pieces ». The hub card and the sheet header
 * of a plate are the two places the atelier counts pieces.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { LISTING, PATH, WORKBOOK, boot } from './render.js'

const COUNTS = [
  [0, { fr: '0 pièce', en: '0 pieces' }],
  [1, { fr: '1 pièce', en: '1 piece' }],
  [2, { fr: '2 pièces', en: '2 pieces' }],
  [4, { fr: '4 pièces', en: '4 pieces' }],
]

const counted = (text) => text.match(/\d+ pi[eè]ces?(?![\p{L}])/gu) ?? []

for (const locale of ['fr', 'en']) {
  test(`${locale}: the hub card of a workbook counts its pieces in the locale's rule`, async () => {
    for (const [n, said] of COUNTS) {
      const listing = [{ ...LISTING[0], pieces: n }]
      const session = boot({ locale, listing })
      await session.engine.routes.atelier()
      assert.deepEqual(counted(session.screen()), [said[locale]], `${n} pieces`)
    }
  })

  test(`${locale}: a plate header counts the pieces it cuts in the locale's rule`, async () => {
    const [plate] = WORKBOOK.debit
    const cuts = plate.etapes.filter((e) => e.type === 'tronconnage')
    const pieces = cuts.flatMap((e) => e.pieces) // the fixture has four
    const withCount = (n, id) => ({
      ...plate,
      plaque: id,
      etapes: [
        ...plate.etapes.filter((e) => e.type !== 'tronconnage'),
        ...(n ? [{ ...cuts[0], id: `${id}-TR`, pieces: pieces.slice(0, n) }] : []),
      ],
    })
    const workbook = { ...WORKBOOK, debit: COUNTS.map(([n], i) => withCount(n, `PL${i}`)) }
    const session = boot({ locale, workbook })
    await session.engine.routes['atelier/'](PATH)
    await session.settle()
    const headers = [...session.dom.window.document.querySelectorAll('.blueprint[data-plaque] .bp-h span')]
    assert.deepEqual(
      headers.map((node) => counted(node.textContent).join()),
      COUNTS.map(([, said]) => said[locale]),
    )
  })
}
