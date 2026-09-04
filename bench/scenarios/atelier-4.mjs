/**
 * L'établi dessine-t-il un 4.0 comme un 3.0 ?
 *
 * Le défaut que ce run existe pour attraper : `web/convert.js` normalisait
 * TOUT ce qui n'était pas du 3.0 vers le 3.0. Un 4.0 y serait entré, aurait
 * traversé la conversion 2.0 → 3.0 et se serait vu reprendre sa version au
 * passage. Le garde qui l'en empêche est une ligne, et une ligne se vérifie en
 * unité — mais qu'un plan s'AFFICHE, avec ses bandes, ses pièces et ses cotes,
 * aucun test unitaire ne le dit.
 *
 * Les deux cartes portent le MÊME workbook réel, à la version près, donc le
 * même titre : elles se distinguent par leur rang, pas par leur nom. Les deux
 * captures doivent montrer le même plan.
 */

const etabli = async (bench, rang, theme = 'light') => {
  const page = await bench.open({ height: 1400, theme })
  await page.waitForSelector('text=Atelier', { timeout: 10000 })
  await page.click('text=Atelier')
  // Pas `text=WORKBOOKS` : la petite capitale est du CSS, le DOM dit autre
  // chose, et le sélecteur attend un texte que personne n'a écrit.
  await page.waitForSelector('text=Meuble poubelle', { timeout: 10000 })
  await page.locator('text=Meuble poubelle').nth(rang).click()
  // Pas de `svg` (la coque en pose trois, cachées, pour ses icônes) ni
  // d'étiquette (l'établi n'ouvre pas forcément sur la vue qui les porte) :
  // on laisse la vue se poser et on photographie ce qui vient. La capture EST
  // l'assertion — c'est le point d'un banc graphique.
  await page.waitForTimeout(3000)
  return page
}

export default async function scenario(bench) {
  const accueil = await bench.open({ height: 1400 })
  await accueil.waitForSelector('text=Atelier', { timeout: 10000 })
  await bench.shoot(accueil, '1-accueil-tuile-atelier')

  const trois = await etabli(bench, 0)
  await bench.shoot(trois, '2-etabli-schema-3-0')

  const quatre = await etabli(bench, 1)
  await bench.shoot(quatre, '3-etabli-schema-4-0')

  // Et dans le noir : un plan qui ne survit pas au thème sombre est un plan
  // illisible sur la TV de l'atelier, qui suit le réglage du système.
  const sombre = await etabli(bench, 1, 'dark')
  await bench.shoot(sombre, '4-etabli-4-0-sombre')
}
