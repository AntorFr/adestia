/**
 * `:::timeline` en vrai : trois phases dont une courante, deux jalons, une
 * ligne illisible nommée sous le dessin, et un bloc sans aucune date qui
 * montre la grammaire — et le même dessin la nuit. Puis l'éditeur : un bloc
 * contribué `flow` doit avoir son nœud conteneur, la leçon de v0.50.0.
 * (Un bloc VIDE, lui, est un refus du validateur — `flow` exige un corps —
 * et la première version de cette page l'a prouvé en verrouillant tout.)
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1200 })
    await page.evaluate(() => {
      location.hash = '/page/chantiers/adestia/INDEX.md'
    })
    await page.waitForSelector('text=Cadrage', { timeout: 15_000 })
    await page.waitForTimeout(600)
    await bench.shoot(page, `1-le-planning-${theme}`)
  }

  const page = await bench.open({})
  await page.evaluate(() => {
    location.hash = '/page/chantiers/adestia/INDEX.md'
  })
  await page.waitForSelector('text=Cadrage', { timeout: 15_000 })
  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__surface .milkdown', { timeout: 15_000 })
  await page.waitForTimeout(800)
  await bench.shoot(page, '2-l-editeur-monte')
}
