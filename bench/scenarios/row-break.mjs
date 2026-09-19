/**
 * `:::row` : la ligne coupée, rien de dessiné, et l'éditeur qui le montre.
 *
 * Ce qu'aucun test ne dit : si le `2/3` seul sur sa ligne a l'air voulu, si
 * `:::row` ne laisse ni trait ni hauteur vide entre les deux lignes, et si
 * l'éditeur le montre assez pour qu'on puisse l'enlever. Le nombre de
 * cellules par ligne est imprimé.
 */
const PAGE = '/page/domaines/diy/projets/servante/INDEX.md'

export default async function scenario(bench) {
  const page = await bench.open({ width: 2560, height: 1440 })
  await page.evaluate((route) => {
    location.hash = route
  }, PAGE)
  await page.waitForSelector('text=Sous-projets', { timeout: 15_000 })
  await page.waitForTimeout(600)
  const cells = await page.evaluate(() =>
    [...document.querySelectorAll('.adestia-row')].map((row) => row.querySelectorAll(':scope > .adestia-row__cell').length),
  )
  console.log('cells per line:', JSON.stringify(cells))
  await bench.shoot(page, '1-lecture')

  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__surface .milkdown', { timeout: 15_000 })
  await page.waitForTimeout(800)
  await bench.shoot(page, '2-editeur')
}
