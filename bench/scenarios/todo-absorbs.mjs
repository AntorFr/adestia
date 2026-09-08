/**
 * L'accueil d'une instance française, dont les tâches sont donc dans `taches`.
 *
 * Le défaut : `absorbs` déclarait `todo` seul, alors que `taskFolder()` classe
 * dans `taches` en français. Le dossier des tâches remontait donc en SECTION à
 * côté de la tuile Todo qui le représente déjà — deux portes pour une pièce,
 * dont une sur deux est le mauvais clic.
 *
 * Trois tests couvrent le MÉCANISME (`sections.test.ts`) : qu'un nom déclaré
 * absorbe où qu'il soit filé, ce qu'il y a dessous, et la frontière de segment.
 * Aucun ne dit ce que l'accueil montre une fois la valeur ajoutée — s'il reste
 * une tuile Todo, si les domaines tiennent toujours à côté, et si la grille ne
 * se retrouve pas avec un trou. D'où la photo, dans les deux thèmes.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const screen = await bench.open({ theme })

    // La tuile de l'app, pas le dossier : c'est elle qui doit rester.
    await screen.waitForSelector('text=Todo', { timeout: 15_000 })
    await screen.waitForTimeout(600)
    await bench.shoot(screen, `1-accueil-${theme}`)

    // Ce qui doit avoir DISPARU, dit à voix haute plutôt que laissé à l'œil :
    // une capture prouve ce qu'elle montre, pas ce qu'elle ne montre pas.
    const doubles = await screen.locator('.adestia-tile__label', { hasText: /^T[âa]ches$/i }).count()
    console.log(`[todo-absorbs] ${theme} — tuiles « Taches » en trop : ${doubles}`)
  }
}
