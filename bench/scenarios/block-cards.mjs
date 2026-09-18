/**
 * Des blocs en cartes (`frame=card`), et les mêmes nus.
 *
 * Ce qu'aucun test ne dit : si les deux cartes d'une rangée ont leurs
 * bandeaux sur une ligne, si une checklist nue a bien perdu sa boîte, et si
 * `show=late` filtre. Les positions des titres de la rangée, la bordure de la
 * checklist nue, le nombre de tâches en retard et le débordement des étiquettes
 * de jalons sont imprimés : « aligné », « nu », « filtré » et « dedans » se
 * mesurent.
 */
const PAGE = '/page/domaines/diy/projets/servante/INDEX.md'

export default async function scenario(bench) {
  for (const [theme, width] of [['light', 2560], ['dark', 2560], ['light', 1440]]) {
    const measuring = theme === 'light'
    const page = await bench.open({ theme, width, height: 1600 })
    await page.evaluate((route) => {
      location.hash = route
    }, PAGE)
    await page.waitForSelector('text=Recouper le plateau MDF', { timeout: 15_000 })
    await page.waitForSelector('.pm-timeline__chart', { timeout: 15_000 })
    await page.waitForTimeout(800)
    if (measuring) {
      const measured = await page.evaluate(() => ({
        bandTitles: [...document.querySelectorAll('.adestia-row .adestia-head__title')].map((one) =>
          Math.round(one.getBoundingClientRect().top),
        ),
        bareChecklistBorder: getComputedStyle([...document.querySelectorAll('.todo-block')].at(-1)).borderLeftWidth,
        lateTasks: [...document.querySelectorAll('.todo-block')].at(-1)?.querySelectorAll('li').length,
        // How far a milestone label climbs above its own chart: 0 or less.
        labelsOverflow: [...document.querySelectorAll('.pm-timeline__chart')].map((chart) => {
          const top = chart.getBoundingClientRect().top
          const labels = [...chart.querySelectorAll('.pm-timeline__mile > span')]
          return Math.round(Math.max(...labels.map((one) => top - one.getBoundingClientRect().top)))
        }),
        // Labels writing over each other, per chart: 0.
        labelsOverlapping: [...document.querySelectorAll('.pm-timeline__chart')].map((chart) => {
          const boxes = [...chart.querySelectorAll('.pm-timeline__mile > span')].map((one) => one.getBoundingClientRect())
          let pairs = 0
          boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => {
            if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) pairs += 1
          }))
          return pairs
        }),
        // And past its right edge: 0 or less.
        labelsOverflowRight: [...document.querySelectorAll('.pm-timeline__chart')].map((chart) => {
          const right = chart.getBoundingClientRect().right
          const labels = [...chart.querySelectorAll('.pm-timeline__mile > span')]
          return Math.round(Math.max(...labels.map((one) => one.getBoundingClientRect().right - right)))
        }),
      }))
      console.log(`measured at ${width}px:`, JSON.stringify(measured))
    }
    await bench.shoot(page, `cartes-${width}-${theme}`)
  }
}
