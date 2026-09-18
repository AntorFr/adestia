/**
 * Un titre sur chaque sorte de bloc, et l'endroit où il se pose.
 *
 * Ce qu'aucun test ne dit : si la liste titrée et la carte à côté d'elle ont
 * leurs titres sur une même ligne, si le bandeau d'une liste se lit comme
 * celui d'une carte, et si le titre d'un encadré survit au sombre. Les
 * positions verticales des deux titres du bandeau sont imprimées : « alignés »
 * se mesure.
 */
const PAGE = '/page/domaines/diy/projets/servante/INDEX.md'

export default async function scenario(bench) {
  for (const [theme, width] of [['light', 2560], ['dark', 2560], ['light', 1440]]) {
    const page = await bench.open({ theme, width, height: 1440 })
    await page.evaluate((route) => {
      location.hash = route
    }, PAGE)
    await page.waitForSelector('text=Liste de débit', { timeout: 15_000 })
    await page.waitForTimeout(600)
    if (theme === 'light' && width === 2560) {
      const tops = await page.evaluate(() =>
        [...document.querySelectorAll('.adestia-row .adestia-head__title')].map((one) =>
          Math.round(one.getBoundingClientRect().top),
        ),
      )
      console.log('band title tops:', JSON.stringify(tops))
    }
    await bench.shoot(page, `titres-${width}-${theme}`)
  }
}
