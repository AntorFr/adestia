/**
 * L'accueil quand un dossier ne porte que d'autres dossiers.
 *
 * Le défaut : un cercle partagé contenant `voyages/baden-2026/…` et aucune
 * page directement dans `voyages/`. L'ancienne règle demandait si un dossier
 * portait une page, donc `voyages` n'existait pas et chaque séjour remontait
 * en tuile de premier niveau — trois cartes en vrac là où un domaine allait.
 *
 * Les tests disent « une tuile ». Ils ne disent pas ce qu'elle porte comme
 * nom, comme compte, ni si elle tient à côté des autres — d'où cette photo,
 * dans les deux thèmes.
 */

const put = (bench, path, markdown) =>
  bench.api(`/api/pages/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })

const page = (title) => `---\ntitle: ${title}\n---\n\n# ${title}\n\nDeux mots.\n`

export default async function scenario(bench) {
  // Le dossier du défaut : QUE des sous-dossiers, aucune page à lui.
  await put(bench, 'voyages/baden-2026/baden-2026.md', page('Baden 2026'))
  await put(bench, 'voyages/baden-2026/vannes-a-pied.md', page('Vannes à pied'))
  await put(bench, 'voyages/broceliande-2026/val-sans-retour.md', page('Val sans retour'))
  await put(bench, 'voyages/colo-ucpa-2026/colo-ucpa-2026.md', page('Colo UCPA 2026'))

  // Et deux voisins ordinaires, qui portent leurs pages : la tuile de
  // `voyages` doit tenir à côté d'eux sans se distinguer d'aucune façon.
  await put(bench, 'diy/INDEX.md', '---\ntitle: DIY\nico: 🪚\ncouleur: ambre\n---\n\n# DIY\n')
  await put(bench, 'diy/etabli.md', page('Établi'))
  await put(bench, 'todo/poncer-porte.md', page('Poncer la porte'))

  for (const theme of ['light', 'dark']) {
    const screen = await bench.open({ theme })
    await screen.waitForSelector('text=Voyages', { timeout: 15_000 })
    await screen.waitForTimeout(600)
    await bench.shoot(screen, `1-accueil-${theme}`)
  }

  // Et la descente : la tuile mène aux trois séjours, qui sont ses pièces et
  // non ses voisines.
  const screen = await bench.open({})
  await screen.waitForSelector('text=Voyages', { timeout: 15_000 })
  await screen.click('text=Voyages')
  await screen.waitForTimeout(900)
  await bench.shoot(screen, '2-dedans-les-trois-sejours')
}
