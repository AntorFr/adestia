/**
 * Éditer une entrée, la sauver, puis la rouvrir SANS recharger la page : que
 * montre l'éditeur, et que devient le fichier ?
 */
export default async function scenario(bench) {
  const page = await bench.open({ height: 1600 })
  await page.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })
  await page.waitForSelector('.journal-entry', { timeout: 20_000 })
  await page.waitForTimeout(1200)

  const lire = () =>
    page.evaluate(async () => {
      const r = await fetch('/api/pages/journal/atelier/2026-09-08-1730.md')
      return (await r.json()).markdown
    })
  const surface = () =>
    page.evaluate(
      () => document.querySelector('.journal-entry .adestia-editor__surface')?.innerText ?? '(aucune)',
    )
  const entree = page.locator('.journal-entry').first()

  await entree.locator('button[title="Modifier"]').click()
  await page.waitForTimeout(2500)
  await entree.locator('.ProseMirror').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' ajout')
  await page.waitForTimeout(4000)
  console.log('[sauvegarde] 1re édition, disque —', JSON.stringify((await lire()).slice(-120)))

  await entree.getByRole('button', { name: 'Terminé' }).click()
  await page.waitForTimeout(1500)
  console.log('[sauvegarde] lecture après Terminé —', JSON.stringify(await entree.locator('.adestia-reader').innerText()))

  await entree.locator('button[title="Modifier"]').click()
  await page.waitForTimeout(2500)
  await bench.shoot(page, '1-rouverte')
  console.log('[sauvegarde] 2e ouverture, surface —', JSON.stringify(await surface()))

  await entree.locator('.ProseMirror').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' deux')
  await page.waitForTimeout(4000)
  console.log('[sauvegarde] 2e édition, disque —', JSON.stringify(await lire()))
}
