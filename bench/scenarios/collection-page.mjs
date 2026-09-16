/**
 * Une collection, dessinée par le cœur.
 *
 * Le test dit qu'une facette est une carte et qu'un projet clos est dans le
 * repli. Il ne dit pas si la grille tient sous la phrase de la fiche, si les
 * compteurs se lisent, si le bouton ＋ a l'air d'un bouton — ni si tout ça
 * survit au sombre.
 */
async function openCollection(bench, options = {}) {
  const page = await bench.open(options)
  await page.evaluate(() => {
    location.hash = '/page/diy/projets'
  })
  await page.waitForSelector('.adestia-collection', { timeout: 15_000 })
  await page.waitForTimeout(600)
  return page
}

export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await openCollection(bench, { theme })
    // La fiche parle d'abord, puis les métiers en cartes, le sans-catégorie en dernier.
    await bench.shoot(page, `1-facettes-${theme}`)
  }

  const page = await openCollection(bench)
  await page.click('text=Menuiserie')
  await page.waitForTimeout(500)
  // Une facette ouverte : ce qui vit, et le repli fermé en dessous.
  await bench.shoot(page, '2-facette-ouverte')

  await page.click('details.adestia-archive > summary')
  await page.waitForTimeout(500)
  // Le repli ouvert : la terrasse posée en juin, à un clic, jamais perdue.
  await bench.shoot(page, '3-repli-ouvert')

  // Et la section qui la contient : la collection y est une carte comme une autre.
  await page.evaluate(() => {
    location.hash = '/section/diy'
  })
  await page.waitForSelector('text=Projets', { timeout: 15_000 })
  await page.waitForTimeout(500)
  await bench.shoot(page, '4-dans-sa-section')
}
