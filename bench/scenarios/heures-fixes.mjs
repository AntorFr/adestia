/**
 * Les heures fixes sur l'écran Schedules, photographiées.
 *
 * Ce qu'aucun test ne dit : ce que la tuile affiche vraiment pour une note
 * `at:` — la liste d'heures là où une note `every:` montre sa période, un
 * « next » calculé sur l'horloge murale AVANT tout premier passage, et la
 * note qui porte les deux cadences signalée en défaut plutôt que dessinée
 * comme saine.
 */

/** L'app s'ouvre par sa tuile, comme une personne le ferait. */
const openApp = async (bench, theme) => {
  const page = await bench.open({ theme })
  await page.waitForSelector('.adestia-tile__label', { timeout: 20_000 })
  console.log(
    '[heures-fixes] tuiles :',
    JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll('.adestia-tile__label')].map((one) => one.textContent),
      ),
    ),
  )
  // « Planifications » : le libellé du manifeste passe par la table de
  // traduction de la coque, et le navigateur du banc lit en français.
  await page.click('.adestia-tile:has-text("Planif")')
  await page.waitForSelector('.planif', { timeout: 20_000 })
  await page.waitForTimeout(700)
  return page
}

export default async function scenario(bench) {
  // Ce que le serveur a réellement assemblé, imprimé plutôt que supposé.
  const { notes, enabled } = await bench.api('/api/plugin/planif/notes')
  console.log(`[heures-fixes] horloge : ${enabled ? 'en marche' : 'coupée'}`)
  for (const note of notes) {
    console.log(
      `[heures-fixes] ${note.id} — at=${note.at} every=${note.every}` +
        ` next=${note.nextRun} problem=${note.problem}`,
    )
  }

  for (const theme of ['light', 'dark']) {
    const page = await openApp(bench, theme)

    // La note à heures fixes porte sa liste d'heures, pas un tiret.
    const at = await page.locator('.planif-every >> text=06:30, 12:30, 18:30').count()
    // La note confuse est en défaut, visible.
    const both = await page.locator('.planif-problem >> text=both').count()
    console.log(`[heures-fixes] ${theme} : badge heures=${at} défaut double-cadence=${both}`)

    await bench.shoot(page, `1-schedules-${theme}`)
  }
}
