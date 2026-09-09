/**
 * Les quatre rendus génériques, sur une vraie page.
 *
 * Ce qu'aucun test ne dit : si quatre tuiles tiennent sur une ligne, si la
 * liste se distingue de la prose qui l'entoure, si le tableau respire, et si
 * le bandeau `w=2/3` + `w=1/3` tombe juste. Plus la question qui ne se règle
 * qu'à l'œil : est-ce que cinq blocs à la suite se lisent comme une page, ou
 * comme un empilement de widgets.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1100 })
    await page.evaluate(() => {
      location.hash = '/page/chantiers/adestia/INDEX.md'
    })
    await page.waitForSelector('text=Synthese', { timeout: 15_000 })
    await page.waitForTimeout(600)
    await bench.shoot(page, `1-la-page-${theme}`)
  }

  // Et le repli : ce qui est clos est à un clic, jamais perdu.
  const page = await bench.open({})
  await page.evaluate(() => {
    location.hash = '/page/chantiers/adestia/INDEX.md'
  })
  await page.waitForSelector('summary', { timeout: 15_000 })
  await page.click('summary')
  await page.waitForTimeout(500)
  await bench.shoot(page, '2-le-repli-ouvert')
}
