/**
 * Deux silences, regardés.
 *
 * Aucun des deux ne se voit dans un test : ils se voient dans ce que l'écran
 * dit ou ne dit pas. La coque affichait l'accueil pour une adresse morte —
 * indiscernable d'un lien casse — et faisait disparaitre un dossier dont le
 * nom appartenait a une app, avec les pages dedans.
 */

const MISSING = '#/page/sante/dietetique/reperes-proteines'
const NAMESAKE = '#/section/sante/dietetique/journal'
const PERIOD = '#/page/sante/dietetique/journal/2026-09-07'

const go = async (page, hash, selector) => {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await page.waitForSelector(selector, { timeout: 10_000 })
  await page.waitForTimeout(400)
}

export default async function scenario(bench) {
  const page = await bench.open({})

  // Une adresse qui ne mene nulle part. Avant : l'accueil, sans un mot.
  await go(page, MISSING, '.adestia-missing')
  await bench.shoot(page, '1-adresse-morte')

  // Le dossier homonyme : il existe de nouveau comme section, et il montre ce
  // qu'il porte. C'est le lien « ouvrir le dossier au-dessus » qui y mene.
  await go(page, NAMESAKE, '.adestia-card__title')
  await bench.shoot(page, '2-dossier-homonyme')

  // Et la periode s'ouvre pour ce qu'elle est.
  await go(page, PERIOD, '.meals-card')
  await bench.shoot(page, '3-la-periode')

  const dark = await bench.open({ theme: 'dark' })
  await go(dark, MISSING, '.adestia-missing')
  await bench.shoot(dark, '4-adresse-morte-sombre')
}
