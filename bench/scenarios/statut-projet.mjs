/**
 * Le `project-status` : dans la liste des sous-projets, et sur le planning.
 *
 * Trois choses qu'aucun test ne dit. Les trois familles se distinguent-elles
 * quand la couleur tient dans une BOULETTE de quelques pixels au lieu d'une
 * pastille — c'est la question que ce banc pose depuis que l'état a quitté la
 * fin de ligne, et elle ne se règle qu'à l'œil, en clair comme en sombre. La précédence se voit-elle — « Le mode
 * ask » porte « nominal » et doit afficher « bloqué ». Et la barre d'un
 * projet noté doit avoir perdu la couleur que le calendrier lui donnait :
 * « Bascule infra » est en retard ET notée « en danger », et une seule des
 * deux couleurs doit rester.
 *
 * Rejouer avec `BENCH_SKIN=skippy bench/run.sh … bench/shots-skippy` : c'est
 * ce run-là qui prouve le choix des tokens, puisque ce skin aplatit les
 * teintes nommées et garde les sémantiques.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1400 })
    await page.evaluate(() => {
      location.hash = '/page/chantiers/adestia/INDEX.md'
    })
    await page.waitForSelector('.pm-subproject__ico--red', { timeout: 15_000 })
    await page.waitForSelector('.pm-timeline__span', { timeout: 15_000 })
    await page.waitForTimeout(600)
    await bench.shoot(page, `1-les-sous-projets-${theme}`)
  }

  const page = await bench.open({ height: 1400 })
  await page.evaluate(() => {
    location.hash = '/page/chantiers/adestia/INDEX.md'
  })
  await page.waitForSelector('.pm-subproject__row', { timeout: 15_000 })

  // Affirmé plutôt que regardé : une couleur se photographie, une RÈGLE se
  // vérifie. Le banc dit où chaque mot a fini, le reste est pour l'œil.
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.pm-subproject__row')].map((row) => ({
      titre: row.querySelector('.pm-subproject__title')?.textContent,
      mot: row.querySelector('.pm-subproject__tag')?.textContent ?? null,
      // L'état est porté par la BOULETTE ; le mot à droite ne l'est plus.
      ton: row.querySelector('.pm-subproject__ico')?.className.split('--').pop() ?? null,
      boulette: row.querySelector('.pm-subproject__ico')?.getAttribute('aria-label') ?? null,
    })),
  )
  console.log('LES LIGNES', JSON.stringify(rows))

  const bars = await page.evaluate(() =>
    [...document.querySelectorAll('.pm-timeline__span')].map((bar) => ({
      titre: bar.textContent,
      etat: bar.className.split('pm-timeline__span--').pop(),
    })),
  )
  console.log('LES BARRES', JSON.stringify(bars))

  // Le repli : ce qui est clos est à un clic, jamais perdu — et sa pastille
  // dit « clos », pas la vieille note restée dans son entête.
  await page.click('.pm-subproject__fold > summary')
  await page.waitForTimeout(400)
  await bench.shoot(page, '2-le-repli-ouvert')

  // Et le champ tel qu'une personne le change : le ⚙ des propriétés, sur une
  // page de projet. Rien n'a été codé pour lui — le manifeste l'a déclaré.
  await page.evaluate(() => {
    location.hash = '/page/chantiers/adestia/socle/INDEX.md'
  })
  await page.waitForTimeout(800)
  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__surface .milkdown', { timeout: 15_000 })
  await page.click('.adestia-editor__meta-gear')
  await page.waitForSelector('.adestia-editor__meta-panel', { timeout: 15_000 })
  await page.waitForTimeout(600)
  await bench.shoot(page, '3-le-champ-dans-les-proprietes')
}
