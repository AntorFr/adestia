/**
 * Ce qu'un voyage porte SOUS sa timeline.
 *
 * Deux blocs y vivent : les fiches du dossier — qui existaient — et les pièces
 * jointes — qui n'existaient pas, si bien qu'une carte d'embarquement rangée
 * dans `assets/` n'était atteignable que par la carte qui la déclare. Les deux
 * sont sous la ligne de flottaison, et c'est exactement ce qu'un test unitaire
 * ne peut pas dire : la règle du dossier est vérifiée à côté, ce qui manque
 * c'est de voir que les billets sont là, lisibles, et distincts des fiches.
 *
 * Viewport HAUT plutôt que `fullPage` : la coque scrolle DANS elle-même, le
 * document n'est jamais plus grand que la fenêtre — voir le README.
 */

const TRIP = '#/voyages/corse'

const ouvre = async (bench, theme = 'light') => {
  const page = await bench.open({ height: 1800, theme })
  await page.evaluate((cible) => {
    window.location.hash = cible
  }, TRIP)
  await page.waitForSelector('.voyages .vday', { timeout: 10_000 })
  // Le dossier arrive sur deux fetch après le premier rendu : on laisse les
  // deux blocs se poser plutôt que d'attendre celui qu'on veut voir absent.
  await page.waitForTimeout(1200)
  return page
}

export default async function scenario(bench) {
  const page = await ouvre(bench)
  await bench.shoot(page, '1-voyage-entier')

  // Le sujet, cadré : les deux blocs l'un sous l'autre. Une fiche s'OUVRE, une
  // pièce jointe se TÉLÉCHARGE — si les deux se ressemblent trop, le bloc ment
  // sur ce que fait le clic.
  await page.locator('.voyages .vdocs').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await bench.shoot(page, '2-fiches-et-pieces-jointes')

  // Le piège du prep : `jours/mardi.md` et son PDF appartiennent à la page qui
  // vit là, pas au voyage. Ce que la capture montre, ce compte le dit.
  const rendu = await page.evaluate(() => ({
    fiches: [...document.querySelectorAll('.voyages .vdoss .vhub-card .ct')].map((n) => n.textContent.trim()),
    jointes: [...document.querySelectorAll('.voyages .vdocs .vdoc .fs')].map((n) => n.textContent.trim()),
  }))
  console.log('  fiches  :', JSON.stringify(rendu.fiches))
  console.log('  jointes :', JSON.stringify(rendu.jointes))

  // La modale : le document d'une carte se dessine avec la MÊME vignette que
  // le bloc du dossier depuis ce chantier. Deux dessins d'un même objet, c'est
  // deux choses à réparer le jour où l'une bouge.
  await page.locator('.voyages .vcard').first().click()
  await page.waitForSelector('.vmodal .vfiche', { timeout: 5000 })
  await page.waitForTimeout(400)
  await bench.shoot(page, '3-la-vignette-dans-la-modale')

  // Et dans le noir, où un fond de vignette posé à la main se voit tout de
  // suite.
  const sombre = await ouvre(bench, 'dark')
  await sombre.locator('.voyages .vdocs').scrollIntoViewIfNeeded()
  await sombre.waitForTimeout(300)
  await bench.shoot(sombre, '4-en-sombre')
}
