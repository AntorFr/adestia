/**
 * Le todo v2, photographié : la liste, la fiche, et le bloc dans une page.
 *
 * Les tests rendent des composants ; ils ne disent pas où une chose SE POSE,
 * si elle survit au thème sombre, ni si le rail mange la liste en dessous. Ce
 * dépôt a déjà livré vert une bande d'onglets qui transformait le fil en trois
 * colonnes vides — d'où ces planches, dans les deux thèmes.
 *
 * Ce qu'il faut vraiment regarder : que les différées ne soient PAS dans les
 * vues vivantes (sinon `start:` ne sert à rien), que les tâches du cercle
 * famille portent leur liseré et leur onglet, et que « à prendre » se voie.
 *
 * ⚠️ La tuile Todo ne déclare aucune route : on y entre en CLIQUANT, pas en
 * posant un hash. Une première version attendait `.todo` sur l'accueil et a
 * expiré vingt secondes en photographiant le lanceur.
 */

/** L'app s'ouvre par sa tuile, comme une personne le ferait. */
const openApp = async (bench, theme, height) => {
  const page = await bench.open(height === undefined ? { theme } : { theme, height })
  await page.click('.adestia-tile:has-text("Todo")')
  await page.waitForSelector('.todo', { timeout: 20_000 })
  // La liste arrive sur l'index des pages, l'identité sur /api/instance.
  await page.waitForTimeout(700)
  return page
}

export default async function scenario(bench) {
  // Ce que le serveur a réellement assemblé, imprimé plutôt que supposé : une
  // photo montrant huit lignes ne dit pas LESQUELLES.
  const index = await bench.api('/api/pages/index')
  const tasks = index.entries.filter((entry) => entry.fields?.type === 'tache')
  console.log(`[todo-v2] tâches indexées : ${tasks.length}`)
  console.log(`[todo-v2] magasins : ${JSON.stringify((index.stores ?? []).map((s) => s.id))}`)
  console.log(`[todo-v2] avec un corps : ${tasks.filter((t) => t.body).length}`)

  for (const theme of ['light', 'dark']) {
    // 1 — la liste en entier : chapeau, capture, rail, facettes, groupes, replis.
    const list = await openApp(bench, theme, 1500)
    await bench.shoot(list, `1-liste-${theme}`)

    // Ce qu'une capture ne prouve pas : ce qu'elle ne montre PAS.
    const deferred = await list.locator('.todo-group .todo-list >> text=Ramoner le poêle').count()
    const free = await list.locator('.todo-who--free').count()
    const marks = await list.locator('.todo-task__store').count()
    console.log(`[todo-v2] ${theme} — différées dans une vue vivante : ${deferred} (attendu 0)`)
    console.log(`[todo-v2] ${theme} — pastilles « à prendre » : ${free}`)
    console.log(`[todo-v2] ${theme} — onglets de magasin : ${marks}`)

    // 2 — la capture ouverte : deux dates côte à côte, porteur, domaine. C'est
    // la ligne la plus susceptible de déborder.
    const capture = await openApp(bench, theme)
    await capture.click('.todo-new__more')
    await capture.fill('.todo-new__title', 'Déclarer les impôts fonciers')
    await capture.waitForTimeout(300)
    await bench.shoot(capture, `2-capture-${theme}`)

    // 3 — le repli des différées, ouvert.
    const later = await openApp(bench, theme, 1400)
    await later.click('.todo-fold >> nth=0 >> summary')
    await later.waitForTimeout(300)
    await bench.shoot(later, `3-differees-${theme}`)

    // 4 — la fiche : les champs, la note dans l'éditeur du shell, les
    // documents cités, les sous-tâches.
    const sheet = await openApp(bench, theme, 1500)
    await sheet.click('.todo-task__title >> text=Poncer la porte du garage')
    await sheet.waitForSelector('.todo-sheet', { timeout: 20_000 })
    await sheet.waitForTimeout(900)
    await bench.shoot(sheet, `4-fiche-${theme}`)

    // 5 — le bloc, dans la prose de quelqu'un : il doit se lire comme une
    // partie de la page, pas comme un widget posé dessus.
    const block = await bench.open({ theme, height: 1100 })
    await block.evaluate(() => {
      window.location.hash = '#/page/domaines/diy/garage'
    })
    await block.waitForSelector('.todo-block', { timeout: 20_000 })
    await block.waitForTimeout(900)
    await bench.shoot(block, `5-bloc-${theme}`)

    const inBlock = await block.locator('.todo-block .todo-task').count()
    const canAdd = await block.locator('.todo-block__add').count()
    console.log(`[todo-v2] ${theme} — tâches remontées par le bloc : ${inBlock}`)
    console.log(`[todo-v2] ${theme} — ligne d'ajout dans le bloc : ${canAdd}`)
  }
}
