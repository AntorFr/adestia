/**
 * Le fil d'Ariane sur une fiche qui EST son dossier.
 *
 * Un dossier ne tenant qu'une seule page du type que son plugin réclame
 * s'ouvre SUR cette page : le dossier et la fiche sont un seul écran. Le
 * bandeau en dessinait deux marches — « Chantiers / Rénovation de la cuisine /
 * Rénovation de la cuisine » — dont la première était un lien vers l'écran
 * déjà sous les yeux du lecteur, donc un clic qui ne faisait rien.
 *
 * Le cas JUMEAU, sur `carnets/jardin`, se corrige autrement et c'est le point
 * du run : là, personne ne possède le dossier, la marche mène à l'étagère —
 * un vrai second écran — et la retirer coûterait une entrée. C'est le
 * LIBELLÉ qui cède : le dossier porte son propre nom, la page garde son titre.
 *
 * Ce qu'un test unitaire ne dit pas et qu'on vient chercher ici : à quoi
 * ressemblent les deux bandeaux côte à côte, et qu'il reste une marche
 * cliquable au-dessus dans les deux cas. La contre-épreuve est la page
 * voisine, d'où le chantier est une vraie étape — si la correction mangeait
 * la marche là aussi, la capture 3 le dirait tout de suite.
 */

const ouvre = async (bench, hash, theme = 'light') => {
  const page = await bench.open({ theme })
  await page.evaluate((cible) => {
    window.location.hash = cible
  }, hash)
  await page.waitForSelector('.adestia-crumbs button', { timeout: 10_000 })
  await page.waitForTimeout(800)
  return page
}

/** Le bandeau tel qu'un lecteur le lit : le libellé, et s'il mène quelque part. */
const bandeau = (page) =>
  page.evaluate(() =>
    [...(document.querySelector('.adestia-crumbs')?.children ?? [])]
      .filter((node) => !node.classList.contains('adestia-crumbs__sep'))
      .map((node) => `${node.textContent.trim()}${node.tagName === 'BUTTON' ? ' →' : ''}`),
  )

export default async function scenario(bench) {
  // L'adresse d'un chantier est celle de son DOSSIER : `cuisine.md` est un
  // détail de stockage, et il n'a pas plus sa place dans un lien que `.md`.
  const fiche = await ouvre(bench, '#/page/chantiers/cuisine')
  console.log('  sur la fiche :', JSON.stringify(await bandeau(fiche)))
  await bench.shoot(fiche, '1-fiche-du-dossier')

  // La marche restante doit ramener au dossier des chantiers, pas nulle part.
  await fiche.locator('.adestia-crumbs button').last().click()
  await fiche.waitForTimeout(800)
  console.log('  après le clic :', JSON.stringify(await bandeau(fiche)))
  await bench.shoot(fiche, '2-retour-par-la-marche')

  // La contre-épreuve : depuis une page ordinaire du même dossier, le chantier
  // est une étape à part entière et reste un retour.
  const voisine = await ouvre(bench, '#/page/chantiers/cuisine/devis')
  console.log('  sur la voisine :', JSON.stringify(await bandeau(voisine)))
  await bench.shoot(voisine, '3-page-voisine')

  // Le jumeau : un dossier que personne ne possède. La marche reste — elle
  // ouvre l'étagère, qui est un autre écran — mais elle cesse d'emprunter le
  // titre de la page qu'on est en train de lire.
  const carnet = await ouvre(bench, '#/page/carnets/jardin')
  console.log('  sur l\'aperçu  :', JSON.stringify(await bandeau(carnet)))
  await bench.shoot(carnet, '4-apercu-d-un-dossier-sans-plugin')

  // Et la marche mène bien quelque part : l'étagère du dossier, ses fichiers.
  await carnet.locator('.adestia-crumbs button').last().click()
  await carnet.waitForTimeout(800)
  console.log('  sur l\'étagère :', JSON.stringify(await bandeau(carnet)))
  await bench.shoot(carnet, '5-l-etagere-derriere-la-marche')

  // Et dans le noir, où le bandeau est la première chose qu'on lit.
  const sombre = await ouvre(bench, '#/page/chantiers/cuisine', 'dark')
  await bench.shoot(sombre, '6-en-sombre')
}
