/**
 * `:::timeline` aux DEUX portées, sur une seule page.
 *
 * Rédigée : trois phases dont une courante, deux jalons, une ligne illisible
 * nommée sous le dessin, et un bloc sans aucune date qui montre la grammaire.
 * Requêtée : une barre par sous-chantier lue dans les entêtes, dont une close
 * qui doit se voir FINIE malgré ses dates, et une aux dates inversées nommée
 * dessous. Les barres de la seconde s'ouvrent — la troisième photo le prouve.
 *
 * La page porte aussi deux `:::content{view=cards}` côte à côte, avec un
 * `:::callout` juste dessous — la seule façon de vérifier que la section
 * encadrée et l'aparté ne se ressemblent pas.
 *
 * Et les deux autres vues de `:::list` — des pastilles pour
 * des rôles ÉCRITS, des cartes pour les sous-chantiers requêtés — parce que
 * « ça tient sur une ligne » et « ça se lit » sont deux questions différentes.
 *
 * Puis l'éditeur : un bloc `optional` doit avoir son nœud conteneur ET
 * survivre sans corps, ce qu'aucun test de rendu ne dit.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 2600 })
    await page.evaluate(() => {
      location.hash = '/page/chantiers/adestia/INDEX.md'
    })
    await page.waitForSelector('text=Cadrage', { timeout: 15_000 })
    await page.waitForTimeout(600)
    await page.waitForSelector('.adestia-content--cards', { timeout: 15_000 })
    await page.waitForSelector('.adestia-list__said', { timeout: 15_000 })
    await page.waitForSelector('.adestia-chip__plate', { timeout: 15_000 })
    await page.waitForSelector('.adestia-list--cards', { timeout: 15_000 })
    await bench.shoot(page, `1-le-planning-${theme}`)
  }

  const page = await bench.open({ height: 1500 })
  // Suivre un LIEN vers le dossier — le fil d'Ariane depuis un sous-chantier.
  // C'est là que la règle joue : `chantiers/adestia` ne tient qu'une fiche de
  // type `project-management`, donc le lien mène à cette fiche et non à
  // l'étagère. (Taper `/section/…` à la main donne toujours l'étagère : la
  // résolution est dans le lien, pas dans la route.)
  await page.evaluate(() => {
    location.hash = '/page/chantiers/adestia/editeur/INDEX.md'
  })
  await page.waitForSelector('.adestia-crumbs', { timeout: 15_000 })
  await page.click('.adestia-crumbs a:has-text("Adestia v1"), .adestia-crumbs button:has-text("Adestia v1")')
  await page.waitForTimeout(1200)
  console.log('LE LIEN MÈNE À', await page.evaluate(() => location.hash))
  await page.waitForSelector('text=Cadrage', { timeout: 15_000 })
  await bench.shoot(page, '5-le-dossier-ouvre-sa-fiche')

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
  //
  // One button now, `Terminé`, and it saves only a DIRTY document — so the
  // document has to be dirtied for the serialiser to run at all. Typing one
  // word does it, and round-trips the whole page, body-less blocks included.
  await page.click('.adestia-editor__surface .milkdown')
  await page.keyboard.type(' Retouché.')
  await page.waitForTimeout(300)
  await page.click('button:has-text("Terminé")')
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    location.reload()
  })
  await page.waitForSelector('.adestia-list--cards', { timeout: 20_000 })
  // Le mot tapé doit être là, sinon l'enregistrement n'a pas eu lieu et la
  // photo ne prouverait rien. Et le bloc SANS CORPS doit avoir survécu au
  // sérialiseur — c'est la seule chose que cette étape existe pour prouver,
  // donc on l'affirme au lieu de la regarder : une barre du planning
  // consolidé, qu'aucune timeline rédigée de cette page ne porte.
  await page.waitForSelector('text=Retouché.', { timeout: 20_000 })
  await page.waitForSelector('.pm-timeline__span:has-text("Socle de contenu")', { timeout: 20_000 })
  await page.waitForTimeout(800)
  await bench.shoot(page, '4-apres-enregistrement')
}
