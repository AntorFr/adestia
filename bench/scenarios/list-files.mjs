/**
 * Les fichiers d'une page, placés par des listes, et la bande qui s'efface.
 *
 * Ce qu'aucun test ne dit : si la planche de photos a l'air d'une planche, si
 * les documents en lignes se lisent à côté d'elle dans la même rangée, et si
 * la bande « Fichiers joints » ne garde que le zip — le seul fichier qu'aucune
 * liste n'a montré. Ce qu'elle garde est imprimé : « rien de répété » se
 * vérifie.
 */
const PAGE = '/page/domaines/diy/projets/servante/INDEX.md'

export default async function scenario(bench) {
  for (const [theme, width] of [['light', 2560], ['dark', 2560], ['light', 1440]]) {
    const page = await bench.open({ theme, width, height: 1440 })
    await page.evaluate((route) => {
      location.hash = route
    }, PAGE)
    await page.waitForSelector('text=plan-de-coupe.pdf', { timeout: 15_000 })
    await page.waitForSelector('.adestia-list__thumb img', { timeout: 15_000 })
    await page.waitForTimeout(800)
    if (theme === 'light' && width === 2560) {
      const strip = await page.evaluate(() =>
        [...document.querySelectorAll('.adestia-page-files a')].map((one) => one.textContent?.trim()),
      )
      console.log('strip keeps:', JSON.stringify(strip))
    }
    await bench.shoot(page, `fichiers-${width}-${theme}`)
  }
}
