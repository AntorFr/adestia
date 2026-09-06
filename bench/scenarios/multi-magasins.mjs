/**
 * Une mémoire composée de deux cercles, regardée.
 *
 * Ce que ni un test ni un témoin ne disent : où la marque SE POSE, si elle
 * survit au sombre, si le liseré se distingue à distance de lecture, et si
 * deux fiches homonymes se laissent distinguer avant qu'on en ouvre une.
 *
 * Le dossier `voyages` est porté par les deux magasins : à l'écran il n'y en
 * a qu'un, et c'est tout le principe.
 */
async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(700)
}

export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1200 })
    await page.waitForSelector('.adestia-home')

    // L'accueil : le domaine `voyages` est porté par les deux cercles, donc sa
    // tuile porte la marque « mélangé ». Ce commentaire a d'abord dit
    // l'inverse — que la fusion y était invisible et que c'était voulu. Ça
    // l'était tant que la provenance ne vivait que sur les FICHES : un dossier
    // partagé ressemblait alors exactement à un dossier privé.
    await bench.shoot(page, `1-accueil-${theme}`)

    // Le dossier fusionné : quatre fiches de deux cercles, la légende sous le
    // titre, et les deux « Voyage Italie » dont une suffixée.
    await go(page, '/section/voyages')
    await page.waitForSelector('.adestia-card__title')
    await bench.shoot(page, `2-voyages-fusionne-${theme}`)

    // Une fiche du cercle familial, ouverte par son qualificatif : l'adresse
    // ne porte pas d'extension, et le magasin y est un qualificatif, pas un
    // morceau du nom.
    await go(page, '/page/voyages/italie?store=famille')
    await page.waitForTimeout(600)
    await bench.shoot(page, `3-fiche-familiale-${theme}`)
  }
}
