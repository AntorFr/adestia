/**
 * Éditer une entrée DÉJÀ écrite, dans le journal.
 *
 * Le défaut rapporté : le ✎ d'une entrée ouvre « une section d'édition vide »
 * et « le contenu reste en dessous ». Le code dit que c'est impossible —
 * `Editor` rend la surface OU le lecteur, jamais les deux — donc soit le code
 * ment, soit ce qui reste dessous est autre chose que ce qu'on croit. Une
 * capture tranche ; une lecture de code, non.
 */
export default async function scenario(bench) {
  const page = await bench.open({ height: 1600 })
  await page.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })

  await page.waitForSelector('.journal-entry', { timeout: 20_000 })
  await page.waitForTimeout(1200)
  await bench.shoot(page, '1-lecture')

  // Ce que la lecture montre, dit à voix haute : une capture prouve ce qu'elle
  // montre, pas ce qu'elle ne montre pas.
  const before = await page.evaluate(() => ({
    entrees: document.querySelectorAll('.journal-entry').length,
    lecteurs: document.querySelectorAll('.journal-entry .adestia-reader').length,
    crayons: document.querySelectorAll('.journal-entry button[title="Modifier"]').length,
    premierTexte: document.querySelector('.journal-entry .adestia-reader')?.innerText?.trim().slice(0, 80) ?? '(rien)',
  }))
  console.log('[journal] lecture —', JSON.stringify(before))

  // Le geste qu'une personne fait : le ✎ de la PREMIÈRE entrée.
  await page.locator('.journal-entry button[title="Modifier"]').first().click()
  await page.waitForTimeout(2500)
  await bench.shoot(page, '2-edition')

  const after = await page.evaluate(() => {
    const entree = document.querySelector('.journal-entry')
    const surface = entree?.querySelector('.adestia-editor__surface')
    const milkdown = surface?.querySelector('.milkdown')
    return {
      surfacePresente: Boolean(surface),
      surfaceHauteur: surface ? Math.round(surface.getBoundingClientRect().height) : null,
      milkdownPresent: Boolean(milkdown),
      texteDansLaSurface: (surface?.innerText ?? '').trim().slice(0, 120),
      // Ce qui « reste en dessous » : y a-t-il encore un lecteur dans CETTE entrée ?
      lecteurDansCetteEntree: Boolean(entree?.querySelector('.adestia-reader')),
      lecteursAilleurs: document.querySelectorAll('.journal-entry .adestia-reader').length,
    }
  })
  console.log('[journal] édition —', JSON.stringify(after))

  // Et la même chose sur une entrée du MILIEU, au cas où le rang compterait.
  const seconde = page.locator('.journal-entry').nth(1)
  await seconde.locator('button[title="Modifier"]').click()
  await page.waitForTimeout(2500)
  await bench.shoot(page, '3-edition-seconde')

  const dark = await bench.open({ theme: 'dark', height: 1600 })
  await dark.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })
  await dark.waitForSelector('.journal-entry', { timeout: 20_000 })
  await dark.locator('.journal-entry button[title="Modifier"]').first().click()
  await dark.waitForTimeout(2500)
  await bench.shoot(dark, '4-edition-sombre')
}
