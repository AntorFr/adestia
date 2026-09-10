/**
 * Une entrée vide, et le crayon qui s'en échappe.
 *
 * Le ✎ de chaque entrée est positionné en ABSOLU dans sa carte, pour tenir sur
 * la ligne de la date au lieu de prendre une rangée à lui. Sur une carte qui
 * n'a presque pas de hauteur — une entrée sans titre ni corps, ce que `+` sans
 * titre produit — il n'y a pas de place pour lui, et il déborde sur la carte
 * suivante. Mesuré plutôt que jugé à l'œil.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1100 })
    await page.evaluate(() => {
      window.location.hash = '/journal/atelier'
    })
    await page.waitForSelector('.journal-entry', { timeout: 20_000 })
    await page.waitForTimeout(1200)
    await bench.shoot(page, `v1-liste-${theme}`)

    const debords = await page.evaluate(() =>
      [...document.querySelectorAll('.journal-entry')].map((entree, index) => {
        const carte = entree.getBoundingClientRect()
        const crayon = entree.querySelector('.adestia-editor__header')?.getBoundingClientRect()
        if (!crayon) return { index, crayon: 'absent' }
        return {
          index,
          hauteurCarte: Math.round(carte.height),
          // Ce qui dépasse en bas de sa propre carte, en pixels.
          debordeDe: Math.round(Math.max(0, crayon.bottom - carte.bottom)),
        }
      }),
    )
    console.log(`[vide] ${theme} —`, JSON.stringify(debords))

    if (theme === 'light') {
      console.log('[vide] géométrie —', JSON.stringify(await page.evaluate(() => {
        const entree = document.querySelector('.journal-entry')
        const tete = entree.querySelector('.adestia-editor__header')
        const style = getComputedStyle(tete)
        const carte = entree.getBoundingClientRect()
        const t = tete.getBoundingClientRect()
        return {
          position: style.position,
          offsetParent: tete.offsetParent?.className ?? null,
          hautDeLaTete: Math.round(t.top - carte.top),
          hauteurTete: Math.round(t.height),
          minHeightTete: style.minHeight,
          contenuTete: tete.innerText.trim().slice(0, 30),
        }
      })))
    }
  }
}
