/**
 * Three references on one page: one that leads somewhere, one that leads
 * nowhere, one that leads to two places.
 *
 * The tests prove the dead one stops being a button. Only a browser can say
 * it still READS as a link that died rather than as ordinary prose — the
 * mark that distinguishes it is a colour, and the live link's own mark is
 * already a dotted underline, which is exactly the kind of collision a green
 * suite cannot see. Hence a shot in each theme.
 *
 * It also settles the question the unit tests cannot reach: whether the index
 * the shell hands the reader actually carries `type` and `id` from the
 * frontmatter. If it does not, every reference on this page draws as dead.
 */

const ALIVE = '01M1RXBTP8F57X5BY4N196XV1T'
const TWIN = '01M1S2QK4YB0ZC7WD3E5F6G7H8'
const GONE = '01M1ZQ9X8W7V6U5T4S3R2Q1P0N'

const put = (bench, path, markdown) =>
  bench.api(`/api/pages/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })

const fiche = (title, id) => `---\ntitle: ${title}\ntype: fiche\nid: ${id}\n---\n\n# ${title}\n`

const CARNET = `---
title: Carnet
---

# Carnet

Un lien qui aboutit : [[fiche#${ALIVE}:la boucle de Vannes]] — la fiche a
déménagé dans \`archives/\`, le lien la suit quand même.

Un lien qui n'aboutit plus : [[fiche#${GONE}:le sentier des douaniers]] — la
page a disparu. Le libellé reste, le lien ne s'ouvre pas.

Un lien qui aboutit deux fois : [[#${TWIN}:le port]] — deux pages portent cet
identifiant, et la référence n'a pas dit lequel des deux types.

Et l'ancienne façon d'écrire, qui ne doit rien changer :
[[domaines/voyages/archives/vannes-a-pied]].
`

export default async function scenario(bench) {
  await put(bench, 'domaines/INDEX.md', '---\ntitle: Domaines\n---\n\n# Domaines\n')
  await put(bench, 'domaines/voyages/INDEX.md', '---\ntitle: Voyages\n---\n\n# Voyages\n')

  // The page the live reference points at, filed where a path-shaped link
  // would NOT have found it.
  await put(bench, 'domaines/voyages/archives/vannes-a-pied.md', fiche('Vannes à pied', ALIVE))

  // Two pages, one identifier, two types: an id is unique within a type, so
  // this is a corpus that is right and a reference that did not say enough.
  await put(bench, 'domaines/voyages/port-de-vannes.md', fiche('Port de Vannes', TWIN))
  await put(
    bench,
    'domaines/voyages/reserver-le-port.md',
    `---\ntitle: Réserver le port\ntype: tache\nid: ${TWIN}\n---\n\n# Réserver le port\n`,
  )

  await put(bench, 'domaines/voyages/carnet.md', CARNET)

  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme })
    page.evaluate(() => {
      location.hash = '/page/domaines/voyages/carnet.md'
    })
    await page.waitForSelector('text=la boucle de Vannes', { timeout: 15_000 })
    await page.waitForTimeout(600)
    await bench.shoot(page, `1-references-${theme}`)
  }
}
