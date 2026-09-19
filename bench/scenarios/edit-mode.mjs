/**
 * La même page lue, puis écrite — et un bloc réglé, un autre saisi.
 *
 * Ce qu'aucun test ne dit : si l'édition ressemble à la lecture (cartes,
 * bandeaux, encadré, rangées), si le panneau ⚙ s'ouvre à la bonne place, et
 * si un bloc de données bascule proprement sur ses lignes brutes.
 */
const PAGE = '/page/domaines/diy/projets/servante/INDEX.md'

export default async function scenario(bench) {
  const page = await bench.open({ width: 2560, height: 1500 })
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message))
  await page.evaluate((route) => {
    location.hash = route
  }, PAGE)
  await page.waitForSelector('text=Sous-projets', { timeout: 15_000 })
  await page.waitForTimeout(800)
  await bench.shoot(page, '1-lecture')

  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__surface .adestia-edblock', { timeout: 20_000 })
  await page.waitForTimeout(1500)
  const views = await page.evaluate(() =>
    [...document.querySelectorAll('.adestia-edblock')].map((one) => `${one.dataset.block}${one.dataset.w ? `:${one.dataset.w}` : ''}`),
  )
  console.log('block views:', JSON.stringify(views))
  await bench.shoot(page, '2-edition')

  // The settings of the synthesis card.
  await page.hover('.adestia-edblock[data-block="content"]')
  await page.click('.adestia-edblock[data-block="content"] .adestia-edblock__gear')
  await page.waitForSelector('.adestia-blockset', { timeout: 5_000 })
  await page.waitForTimeout(300)
  await bench.shoot(page, '3-reglages')
  await page.click('.adestia-blockset__close')

  // The figures, typed in.
  await page.click('.adestia-edblock[data-block="figures"] .adestia-edblock__preview')
  await page.waitForTimeout(500)
  await bench.shoot(page, '4-chiffres-en-saisie')
}
