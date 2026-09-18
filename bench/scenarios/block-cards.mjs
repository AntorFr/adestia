/**
 * Un planning et une checklist en cartes, et les mêmes sans.
 *
 * Ce qu'aucun test ne dit : si les deux cartes d'une rangée ont leurs
 * bandeaux sur une ligne, s'il reste une boîte dans la boîte de la checklist,
 * et si la checklist écrite à l'ancienne (`view=late`) filtre toujours. Les
 * positions des titres de la rangée et le nombre de tâches de l'ancienne sont
 * imprimés : « aligné » et « filtré » se mesurent.
 */
const PAGE = '/page/domaines/diy/projets/servante/INDEX.md'

export default async function scenario(bench) {
  for (const [theme, width] of [['light', 2560], ['dark', 2560], ['light', 1440]]) {
    const page = await bench.open({ theme, width, height: 1600 })
    await page.evaluate((route) => {
      location.hash = route
    }, PAGE)
    await page.waitForSelector('text=Recouper le plateau MDF', { timeout: 15_000 })
    await page.waitForSelector('.pm-timeline__chart', { timeout: 15_000 })
    await page.waitForTimeout(800)
    if (theme === 'light' && width === 2560) {
      const measured = await page.evaluate(() => ({
        bandTitles: [...document.querySelectorAll('.adestia-row .adestia-head__title')].map((one) =>
          Math.round(one.getBoundingClientRect().top),
        ),
        boxInBox: document.querySelectorAll('.adestia-framed .todo-block:not(.todo-block--carded)').length,
        legacyLate: [...document.querySelectorAll('.todo-block')].at(-1)?.querySelectorAll('li').length,
      }))
      console.log('measured:', JSON.stringify(measured))
    }
    await bench.shoot(page, `cartes-${width}-${theme}`)
  }
}
