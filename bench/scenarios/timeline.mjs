/**
 * `:::timeline` aux DEUX portées, sur une seule page.
 *
 * Rédigée : trois phases dont une courante, deux jalons, une ligne illisible
 * nommée sous le dessin, et un bloc sans aucune date qui montre la grammaire.
 * Requêtée : une barre par sous-chantier lue dans les entêtes, dont une close
 * qui doit se voir FINIE malgré ses dates, et une aux dates inversées nommée
 * dessous. Les barres de la seconde s'ouvrent — la troisième photo le prouve.
 *
 * La page porte aussi les deux autres vues de `:::list` — des pastilles pour
 * des rôles ÉCRITS, des cartes pour les sous-chantiers requêtés — parce que
 * « ça tient sur une ligne » et « ça se lit » sont deux questions différentes.
 *
 * Puis l'éditeur : un bloc `optional` doit avoir son nœud conteneur ET
 * survivre sans corps, ce qu'aucun test de rendu ne dit.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1900 })
    await page.evaluate(() => {
      location.hash = '/page/chantiers/adestia/INDEX.md'
    })
    await page.waitForSelector('text=Cadrage', { timeout: 15_000 })
    await page.waitForTimeout(600)
    await page.waitForSelector('.adestia-chip__plate', { timeout: 15_000 })
    await page.waitForSelector('.adestia-list--cards', { timeout: 15_000 })
    await bench.shoot(page, `1-le-planning-${theme}`)
  }

  const page = await bench.open({ height: 1500 })
  await page.evaluate(() => {
    location.hash = '/page/chantiers/adestia/INDEX.md'
  })
  await page.waitForSelector('text=Cadrage', { timeout: 15_000 })
  // Une barre du planning consolidé mène à son chantier : c'est ce qu'un
  // modèle fermé n'aurait pas pu dessiner — un rectangle sans rien derrière.
  await page.click('button.pm-timeline__span:has-text("Éditeur de blocs")')
  // The page's own title is not an h1 — the shell wears it — so the route is
  // the honest signal that the bar actually went somewhere.
  await page.waitForFunction(() => location.hash.includes('/editeur/'), { timeout: 15_000 })
  await page.waitForSelector('.adestia-tag:has-text("chantier")', { timeout: 15_000 })
  await page.waitForTimeout(500)
  await bench.shoot(page, '2-la-barre-ouvre-son-chantier')

  await page.evaluate(() => {
    location.hash = '/page/chantiers/adestia/INDEX.md'
  })
  await page.waitForSelector('.adestia-list--cards', { timeout: 15_000 })
  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__surface .milkdown', { timeout: 15_000 })
  await page.waitForTimeout(800)
  await bench.shoot(page, '3-l-editeur-monte')

  // THE question a body-less block raises, and only an end-to-end run can
  // answer it: does saving keep it? The editor holds an empty container for
  // `:::timeline{depth=subtree}`, and an empty container is exactly the shape
  // a serialiser drops. If the consolidated planning still draws after a
  // save, it survived the round trip.
  await page.click('button:has-text("Enregistrer")')
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    location.reload()
  })
  await page.waitForSelector('.adestia-list--cards', { timeout: 20_000 })
  await page.waitForTimeout(800)
  await bench.shoot(page, '4-apres-enregistrement')
}
