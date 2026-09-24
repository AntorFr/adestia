/**
 * Les mots qu'un plugin DÉCLARE, dans la langue du lecteur.
 *
 * Ce qu'aucun test ne dit : ce que la mosaïque affiche vraiment sous chaque
 * pastille, et si le formulaire d'une tâche lit « Échéance » ou « Due » quand
 * l'instance est française. C'est exactement le défaut signalé — une fiche
 * française, un formulaire anglais — et la table du plugin connaissait déjà
 * les deux mots.
 *
 * Le scénario ouvre DEUX lecteurs sur la même instance, un français et un
 * anglais (l'instance ne déclare aucune langue, donc le navigateur tranche).
 * Les mêmes écrans, les deux langues : c'est la preuve que la clé est la
 * phrase anglaise et non une chaîne française déguisée.
 */
const TACHE = '/page/domaines/diy/projets/servante/chant.md'

const tuiles = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.adestia-tile__label')].map((one) => one.textContent),
  )

const champs = (page) =>
  page.evaluate(() => ({
    groupes: [...document.querySelectorAll('.adestia-blockset__group legend')].map(
      (one) => one.textContent,
    ),
    libelles: [...document.querySelectorAll('label.adestia-blockset__field > span')].map(
      (one) => one.textContent,
    ),
  }))

async function proprietes(page) {
  await page.evaluate((to) => {
    location.hash = to
  }, TACHE)
  await page.waitForSelector('text=Chêne massif', { timeout: 20_000 })
  await page.click('button[title="Modifier"], button[title="Edit"]')
  await page.waitForSelector('.adestia-editor__meta--edit', { timeout: 20_000 })
  await page.click('.adestia-editor__meta-gear')
  await page.waitForSelector('.adestia-blockset--page', { timeout: 5_000 })
  await page.waitForTimeout(400)
}

export default async function scenario(bench) {
  for (const [langue, locale] of [
    ['fr', 'fr-FR'],
    ['en', 'en-GB'],
  ]) {
    const page = await bench.open({ width: 1600, height: 1200, locale })
    page.on('pageerror', (error) => console.log('PAGEERROR', error.message))

    await page.waitForSelector('.adestia-tile__label', { timeout: 20_000 })
    await page.waitForTimeout(800)
    console.log(`tuiles (${langue}):`, JSON.stringify(await tuiles(page)))
    await bench.shoot(page, `1-mosaique-${langue}`)

    await proprietes(page)
    const { groupes, libelles } = await champs(page)
    console.log(`groupes (${langue}):`, JSON.stringify(groupes))
    console.log(`champs (${langue}):`, JSON.stringify(libelles))
    await bench.shoot(page, `2-proprietes-${langue}`)

    // L'aide sous un champ vient du manifeste elle aussi — la phrase la plus
    // longue que la coque dessine pour un plugin, donc celle qui déborde.
    const aides = await page.evaluate(() =>
      [...document.querySelectorAll('.adestia-blockset__hint')].map((one) => one.textContent),
    )
    console.log(`aides (${langue}):`, JSON.stringify(aides.slice(0, 4)))
  }

  // Le sombre, sur le seul écran que ce chantier change vraiment.
  const dark = await bench.open({ theme: 'dark', width: 1600, height: 1200 })
  await proprietes(dark)
  await bench.shoot(dark, '3-proprietes-sombre')
}
