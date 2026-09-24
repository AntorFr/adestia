/**
 * Le statut d'un sous-chantier, en couleur, dans une liste.
 *
 * Ce qu'aucun test ne dit : si les trois familles se distinguent à l'œil
 * — l'accent de l'instance, l'orange de l'attente, le vert du clos — dans une
 * ligne où la pastille voisine une étiquette neutre ; si le repli des pages
 * closes montre bien la troisième ; et si tout ça survit au sombre, où
 * `color-mix` sur un fond sombre donne des aplats que le clair ne montre pas.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1200 })
    await page.evaluate(() => {
      location.hash = '/page/chantiers/adestia/INDEX.md'
    })
    await page.waitForSelector('text=Socle de contenu', { timeout: 15_000 })
    await page.waitForTimeout(600)
    await bench.shoot(page, `1-lignes-et-cartes-${theme}`)

    // Le clos est derrière le repli : c'est la seule famille qu'on ne voit
    // pas sans cliquer, et c'est celle dont la couleur est la plus proche de
    // l'accent sur une instance verte.
    await page.click('summary')
    await page.waitForTimeout(400)
    await bench.shoot(page, `2-le-repli-ouvert-${theme}`)
  }
}
