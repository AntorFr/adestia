/**
 * L'établi dessine-t-il ce que le moteur calcule ?
 *
 * Deux fiches. L'une porte un workbook écrit à la main, l'autre un workbook
 * DÉRIVÉ — pièces, cotes et calepinage sortis du calcul, y compris le choix
 * entre les deux sens de plaque. Un `debit[]` que le validateur accepte n'est
 * pas encore un plan lisible sur une TV d'atelier, et seul un navigateur peut
 * le dire.
 *
 * Le plugin ne livre plus de tuile : l'établi est la vue du DOMAINE, dont la
 * tuile est la porte — une seule, cf. le chantier du 01/09. On descend donc
 * par les pages, comme un humain.
 */

const etabli = async (bench, titre, theme = 'light') => {
  const page = await bench.open({ height: 1400, theme })
  await page.waitForSelector("text=L'Atelier", { timeout: 10000 })
  await page.click("text=L'Atelier")
  await page.waitForTimeout(1500)
  await page.click('text=Projets')
  await page.waitForTimeout(1500)
  await page.locator(`text=${titre}`).first().click()
  // Ni `svg` (la coque en pose trois, cachées, pour ses icônes) ni une
  // étiquette de pièce : on laisse la vue se poser et on photographie ce qui
  // vient. La capture EST l'assertion — c'est le point d'un banc graphique.
  await page.waitForTimeout(2500)
  return page
}

export default async function scenario(bench) {
  const accueil = await bench.open({ height: 1400 })
  await accueil.waitForSelector("text=L'Atelier", { timeout: 10000 })
  await bench.shoot(accueil, '1-accueil-domaine-atelier')

  const main = await etabli(bench, 'Meuble poubelle')
  await bench.shoot(main, '2-workbook-ecrit-a-la-main')

  const derive = await etabli(bench, 'Meuble à tiroirs')
  await bench.shoot(derive, '3-workbook-derive-par-le-moteur')

  // Et dans le noir : un plan qui ne survit pas au thème sombre est un plan
  // illisible sur la TV de l'atelier, qui suit le réglage du système.
  const sombre = await etabli(bench, 'Meuble à tiroirs', 'dark')
  await bench.shoot(sombre, '4-derive-en-sombre')
}
