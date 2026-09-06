/**
 * Où est ce dossier ? La question qu'un écran ne savait pas répondre.
 *
 * Les tests disent qu'une tuile porte `store` ou `mixed`. Ils ne disent pas si
 * la marque se pose au bon coin, si elle survit au sombre, si le demi-cercle
 * du « mélangé » se distingue des deux lettres d'un cercle à distance de
 * lecture — ni si un écran où presque tout est à moi reste calme, ce qui est
 * tout l'intérêt de ne rien dessiner sur le magasin par défaut.
 */
async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(700)
}

export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme })
    await page.waitForSelector('text=Recettes', { timeout: 15_000 })
    await page.waitForTimeout(400)
    // Les trois états sur un écran : Atelier nu, Recettes marqué, Voyages mélangé.
    await bench.shoot(page, `1-trois-etats-${theme}`)
  }

  // Et une pièce à l'intérieur : le séjour est mélangé lui aussi, puisque le
  // carnet est resté chez moi. La marque doit descendre avec le regard.
  const page = await bench.open({})
  await go(page, '/section/voyages')
  await page.waitForTimeout(600)
  await bench.shoot(page, '2-dedans-le-sejour-melange')
}
