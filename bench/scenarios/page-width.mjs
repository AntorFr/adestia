/**
 * La largeur d'une page, sur un grand écran et sur un portable.
 *
 * Ce qu'aucun test ne dit : où la prose s'arrête, si le tableau de débit tient
 * une pièce par ligne, si la carte du haut s'aligne sur les chiffres et le
 * tableau sous elle, et si l'en-tête d'un bloc se lit comme un en-tête. Les
 * mesures sont imprimées à côté des photos : « 830 px » se vérifie, « ça a
 * l'air plus large » ne se vérifie pas.
 */
const PAGE = '/page/domaines/diy/projets/servante/INDEX.md'

async function openPage(bench, options) {
  const page = await bench.open({ height: 1440, ...options })
  await page.evaluate((route) => {
    location.hash = route
  }, PAGE)
  await page.waitForSelector('text=Liste de débit', { timeout: 15_000 })
  await page.waitForTimeout(600)
  return page
}

export default async function scenario(bench) {
  for (const width of [2560, 1440]) {
    const page = await openPage(bench, { width })
    const widths = await page.evaluate(() => {
      const w = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().width ?? 0)
      return {
        page: w('.adestia-reader'),
        prose: w('.adestia-reader > p'),
        card: w('.adestia-reader > .adestia-framed'),
        table: w('.adestia-reader table'),
        band: w('.adestia-row'),
      }
    })
    console.log(`widths at ${width}px:`, JSON.stringify(widths))
    await bench.shoot(page, `1-page-${width}-light`)
  }

  const dark = await openPage(bench, { width: 2560, theme: 'dark' })
  await bench.shoot(dark, '2-page-2560-dark')

  // L'éditeur partage la mesure : la prose s'y arrête au même endroit, le
  // tableau y prend la même largeur. Un réglage d'un côté seulement, et une
  // page change de forme en passant en écriture.
  await dark.click('button[title="Modifier"]')
  await dark.waitForSelector('.adestia-editor__surface .milkdown', { timeout: 15_000 })
  await dark.waitForTimeout(800)
  await bench.shoot(dark, '3-editeur-2560-dark')

  const home = await bench.open({ width: 2560, height: 1440 })
  await home.waitForSelector('.adestia-home', { timeout: 15_000 })
  await home.waitForTimeout(500)
  await bench.shoot(home, '4-accueil-2560')
}
