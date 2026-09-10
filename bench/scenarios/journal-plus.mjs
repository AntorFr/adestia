/**
 * Créer une entrée : `+`, un titre facultatif, et l'éditeur qui s'ouvre.
 *
 * Ce que remplace ce chantier : un textarea nu, seul endroit du produit où
 * écrire voulait dire écrire SANS l'éditeur. Ce qu'aucun test ne dit, c'est
 * si le `+` se voit, si le champ arrive à sa place, et si l'entrée créée
 * s'ouvre bien en posture d'écriture au lieu d'attendre un ✎ de plus.
 */
export default async function scenario(bench) {
  const page = await bench.open({ height: 1600 })
  await page.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })
  await page.waitForSelector('.journal-entry', { timeout: 20_000 })
  await page.waitForTimeout(1000)
  await bench.shoot(page, 'p1-journal')

  // ── Créer avec un titre ──────────────────────────────────────────────────
  await page.click('.journal-add')
  await page.waitForTimeout(500)
  await bench.shoot(page, 'p2-champ-titre')

  await page.fill('.journal-new__title', 'Le gabarit de queues droites')
  await page.click('.journal-new button[type="submit"]')
  // L'éditeur de l'entrée neuve doit être monté SANS qu'on ait touché un ✎.
  await page.waitForSelector('.journal-entry .adestia-editor__surface .ProseMirror', {
    timeout: 20_000,
  })
  await page.waitForTimeout(1200)
  await bench.shoot(page, 'p3-ouverte-en-ecriture')

  const pinceaux = await page.locator('.journal-entry .adestia-editor__surface').count()
  console.log('[plus] surfaces d’édition ouvertes :', pinceaux)

  // Écrire, enregistrer, relire le fichier.
  const neuve = page.locator('.journal-entry').first()
  await neuve.locator('.ProseMirror').click()
  await page.keyboard.type('La cale de 8 mm était la bonne.')
  /*
   * Le frontmatter est-il TOUJOURS là ?
   *
   * Le défaut que ce scénario a trouvé : une entrée neuve n'est qu'un bloc
   * atomique — son frontmatter — donc le clic le sélectionnait et la première
   * frappe le remplaçait. La page enregistrée n'avait plus ni `type`, ni
   * `date`, ni titre : une entrée qui n'en était plus une, et du markdown
   * parfaitement valide, donc pas un mot d'avertissement.
   */
  console.log(
    '[plus] frontmatter après la frappe :',
    await neuve.locator('.ProseMirror .adestia-editor__meta').count(),
  )
  await page.waitForTimeout(400)
  await neuve.locator('button:has-text("Enregistrer")').click()
  await page.waitForTimeout(1500)

  const ecrit = await bench.api('/api/pages/journal/atelier/le-gabarit-de-queues-droites.md')
  console.log('[plus] nommée par son titre —')
  console.log(String(ecrit.markdown ?? ecrit.error ?? JSON.stringify(ecrit)).trim())

  // ── Créer SANS titre : le fichier reprend la date ────────────────────────
  await page.click('.journal-add')
  await page.waitForTimeout(400)
  await page.click('.journal-new button[type="submit"]')
  await page.waitForTimeout(2000)
  const index = await bench.api('/api/pages/index')
  const noms = index.entries.map((e) => e.path).filter((p) => !p.endsWith('INDEX.md'))
  console.log('[plus] fichiers du journal :', JSON.stringify(noms))

  // ── Renommer une entrée qui existait déjà ────────────────────────────────
  const ancienne = page.locator('.journal-entry').last()
  await ancienne.locator('.journal-entry__title').click()
  await page.waitForTimeout(400)
  await bench.shoot(page, 'p4-renommage')
  await page.locator('.journal-entry__rename').fill('Affûtage des ciseaux')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1800)

  const renommee = await bench.api('/api/pages/journal/atelier/2026-09-01-0800.md')
  console.log('[plus] renommée —')
  console.log(String(renommee.markdown ?? renommee.error ?? JSON.stringify(renommee)).trim())
  await bench.shoot(page, 'p5-apres-renommage')

  const nuit = await bench.open({ theme: 'dark', height: 1600 })
  await nuit.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })
  await nuit.waitForSelector('.journal-entry', { timeout: 20_000 })
  await nuit.click('.journal-add')
  await nuit.waitForTimeout(600)
  await bench.shoot(nuit, 'p6-sombre')
}
