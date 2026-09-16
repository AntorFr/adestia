/**
 * Chaque bloc du cœur s'ouvre-t-il encore au ✎, et en revient-il intact ?
 *
 * Six entrées, une par bloc du cœur plus un témoin. Écrit pour une panne —
 * les quatre renderings ajoutés le 2026-09-09 n'avaient pas de nœud
 * d'éditeur et vidaient la zone d'édition — il en reste le garde-fou : on
 * ouvre le ✎ de chacune, l'une après l'autre, et on relève ce que la surface
 * contient VRAIMENT. Un test unitaire monte le composant ; lui seul ne dit
 * pas qu'une surface est là mais vide.
 *
 * Puis trois questions que seul un navigateur tranche : ouvrir n'est pas
 * modifier (le fichier ne doit pas bouger), le menu « / » offre bien les
 * blocs du cœur et les filtre, et un bloc écrit à la main survit à un
 * aller-retour dans l'éditeur.
 */
/**
 * Poser le curseur au bout du dernier paragraphe d'une entrée ouverte.
 *
 * Le curseur doit être au bout du BLOC : `shouldShow` refuse le menu « / »
 * partout ailleurs (`isSelectionAtEndOfNode`). `End` ne va qu'au bout de la
 * ligne VISIBLE et coupe un mot en deux sur un paragraphe replié ; `Ctrl+A`
 * puis une flèche ne replie pas la sélection dans ProseMirror et la frappe
 * suivante REMPLACE le document — les deux essais sont dans l'historique.
 *
 * Trois précautions, chacune payée par une passe perdue :
 *
 *  - la cible est CENTRÉE avant d'être mesurée. Le menu « / » s'ouvre SOUS le
 *    curseur : une cible rendue visible au ras du bas de la fenêtre ouvre son
 *    menu hors champ, et Playwright le dit comme il le voit — « element is
 *    not visible » — ce qui ressemble à un menu cassé.
 *  - on ATTEND que le défilement soit fini avant de mesurer. Une boîte relevée
 *    pendant qu'il glisse donne des coordonnées périmées, et le clic tombe
 *    dans le vide.
 *  - le clic est un VRAI clic de souris aux coordonnées de la page, pas un
 *    clic positionné sur le localisateur. Le second passe les vérifications de
 *    Playwright sans déplacer le caret : le curseur reste au début du
 *    document, la frappe suivante écrit « /Rien que de la prose… » en tête de
 *    paragraphe, et le menu refuse de s'ouvrir puisqu'il n'est pas au bout
 *    d'un nœud. Une capture l'a montré ; aucun message ne le disait.
 */
async function poserLeCurseurAuBout(page, entree) {
  const cible = entree.locator('.ProseMirror p').last()
  await cible.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(400)
  const box = await cible.boundingBox()
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 4)
}

export default async function scenario(bench) {
  const page = await bench.open({ height: 2400 })
  await page.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })
  await page.waitForSelector('.journal-entry', { timeout: 20_000 })
  await page.waitForTimeout(1500)
  await bench.shoot(page, 'b1-lecture')

  // Le titre d'une entrée n'a plus de classe à lui : depuis que le journal
  // monte un éditeur par entrée, il EST le titre de la fiche et se dessine
  // dans l'éditeur (`titleField`). Le sélectionner ailleurs ne rendait plus
  // rien — et une boucle sur une liste vide ne dit rien non plus, sans jamais
  // échouer, ce qui est la pire des deux façons de se taire.
  const titres = await page.$$eval('.journal-entry .adestia-editor__title', (nodes) =>
    nodes.map((n) => n.textContent),
  )
  console.log('[blocs] entrées —', JSON.stringify(titres))
  if (titres.length === 0) throw new Error('aucune entrée lisible : le sélecteur de titre a encore bougé')

  for (let index = 0; index < titres.length; index += 1) {
    const entree = page.locator('.journal-entry').nth(index)
    await entree.locator('button[title="Modifier"]').click()
    await page.waitForTimeout(2000)

    const etat = await page.evaluate((i) => {
      const li = document.querySelectorAll('.journal-entry')[i]
      const surface = li?.querySelector('.adestia-editor__surface')
      return {
        surface: Boolean(surface),
        milkdown: Boolean(surface?.querySelector('.milkdown')),
        proseMirror: Boolean(surface?.querySelector('.ProseMirror')),
        hauteur: surface ? Math.round(surface.getBoundingClientRect().height) : null,
        texte: (surface?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 70),
      }
    }, index)
    console.log(`[blocs] ${titres[index]} —`, JSON.stringify(etat))

    await bench.shoot(page, `b2-${index}-${String(titres[index]).replace(/\W+/g, '-')}`)
    // Refermer, pour que la suivante s'ouvre seule à l'écran.
    await entree.locator('button:has-text("Terminé")').click()
    await page.waitForTimeout(400)
  }

  // Ouvrir n'est pas modifier. Il n'y a plus de bouton « Enregistrer » à
  // trouver éteint — l'éditeur enregistre seul depuis le 10/09 — donc la
  // question se pose au FICHIER : sa révision bouge-t-elle ? On relève avant,
  // on ouvre le ✎, on attend plus longtemps que le délai d'auto-enregistrement,
  // on recompare. Réécrire une page intacte, c'est écraser ce que son autre
  // auteur vient peut-être d'y mettre.
  const TEMOIN = '/api/pages/journal/atelier/2026-09-01-0800.md'
  const avant = await bench.api(TEMOIN)
  const intacte = page.locator('.journal-entry').last()
  await intacte.locator('button[title="Modifier"]').click()
  await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 15_000 })
  await page.waitForTimeout(3000)
  const apres = await bench.api(TEMOIN)
  console.log(
    '[propre] une entrée ouverte sans être touchée n’est pas réécrite :',
    avant.revision === apres.revision,
    `(${avant.revision} → ${apres.revision})`,
  )
  await intacte.locator('button:has-text("Terminé")').click()
  await page.waitForTimeout(400)

  // ── Le menu « / » ────────────────────────────────────────────────────────
  // Ce que le menu OFFRE ne se lit dans aucun test unitaire : il faut le voir
  // posé sur la page, avec ses glyphes.
  const temoin = page.locator('.journal-entry').last()
  await temoin.locator('button[title="Modifier"]').click()
  await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 15_000 })
  await poserLeCurseurAuBout(page, temoin)
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.waitForTimeout(900)
  await bench.shoot(page, 'b2z-curseur-au-bout')
  console.log(
    '[curseur] au bout du dernier paragraphe, menu appelé —',
    JSON.stringify(
      await page.evaluate(() => {
        const host = document.querySelector('.milkdown-slash-menu')
        const r = host?.getBoundingClientRect()
        const ouverts = [...document.querySelectorAll('.journal-entry')].map((li, i) =>
          li.querySelector('.ProseMirror') ? i : null,
        )
        return {
          menu: host ? { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) } : null,
          editeursOuverts: ouverts.filter((i) => i !== null),
          dernierParagraphe: document.querySelector('.journal-entry:last-child .ProseMirror')?.innerText?.slice(-40),
        }
      }),
    ),
  )
  // Notre onglet, ouvert : c'est là que se voient les cinq glyphes ensemble.
  await page.locator('.milkdown-slash-menu .tab-group li:has-text("Blocs")').click({ timeout: 10_000 })
  await page.waitForTimeout(400)
  await bench.shoot(page, 'b3-menu-slash')

  const lire = () =>
    page.evaluate(() => {
      const host = document.querySelector('.milkdown-slash-menu')
      const rect = host?.getBoundingClientRect()
      return {
        ouvert: Boolean(rect && rect.width > 0 && rect.height > 0),
        items: [...(host?.querySelectorAll('.menu-group li') ?? [])]
          .map((n) => n.textContent?.replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      }
    })
  console.log('[menu] ', JSON.stringify(await lire()))

  // Filtré à la frappe : c'est ce qui fait qu'une liste longue reste lisible,
  // et ce qui répond à « on va pas finir avec 200 boutons ».
  await page.keyboard.type('bloc')
  await page.waitForTimeout(700)
  await bench.shoot(page, 'b4-menu-filtre')
  console.log('[menu filtré] ', JSON.stringify(await lire()))

  // Insérer, laisser l'éditeur enregistrer, relire le FICHIER. C'est la seule
  // preuve que le nœud renommé se resérialise en `:::table` et pas en autre
  // chose. On attend que l'éditeur le DISE plutôt qu'un délai au jugé : il
  // part une seconde et demie après la frappe, et une attente fixe est une
  // course déguisée en pause.
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await bench.shoot(page, 'b5-bloc-insere')
  await temoin.locator('.adestia-save--ok').waitFor({ timeout: 15_000 })

  const ecrit = await bench.api(TEMOIN)
  console.log('[insertion] fichier après enregistrement —')
  console.log(String(ecrit.markdown ?? ecrit.error ?? JSON.stringify(ecrit)).trim())

  // Et l'aller-retour d'une entrée qui portait DÉJÀ un bloc : on y touche une
  // lettre et on regarde si le `:::table` a survécu au renommage du nœud.
  const avecTable = page.locator('.journal-entry').nth(1)
  await avecTable.locator('button[title="Modifier"]').click()
  await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 15_000 })
  await poserLeCurseurAuBout(page, avecTable)
  await page.keyboard.type(' Encore.')
  await avecTable.locator('.adestia-save--ok').waitFor({ timeout: 15_000 })

  const relu = await bench.api('/api/pages/journal/atelier/2026-09-05-0800.md')
  console.log('[aller-retour] fichier après enregistrement —')
  console.log(String(relu.markdown ?? relu.error ?? JSON.stringify(relu)).trim())

  // Et dans le noir, parce qu'un menu flottant est exactement le genre de
  // chose qui se peint en clair sur clair sans que rien ne le dise.
  const nuit = await bench.open({ theme: 'dark', height: 2400 })
  await nuit.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })
  await nuit.waitForSelector('.journal-entry', { timeout: 20_000 })
  await nuit.waitForTimeout(1200)
  const soir = nuit.locator('.journal-entry').last()
  await soir.locator('button[title="Modifier"]').click()
  await nuit.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 15_000 })
  // Amenée à l'écran d'abord : la dernière entrée d'un journal de six est
  // sous la ligne de flottaison, et un clic aux coordonnées d'un paragraphe
  // qu'on n'a pas fait défiler tombe à côté — le menu ne s'ouvre pas, et
  // l'attente qui suit expire trente secondes plus tard en accusant le menu.
  await poserLeCurseurAuBout(nuit, soir)
  await nuit.keyboard.press('Enter')
  await nuit.keyboard.type('/')
  await nuit.waitForTimeout(900)
  // L'onglet, si on l'atteint — et sinon on photographie quand même ce que le
  // noir donne, en le DISANT : une capture manquante n'apprend rien, et une
  // panne tue qui se tait non plus.
  try {
    await nuit.locator('.milkdown-slash-menu .tab-group li:has-text("Blocs")').click({ timeout: 5000 })
  } catch {
    console.log('[sombre] onglet « Blocs » hors d’atteinte — capture du menu tel quel')
  }
  await nuit.waitForTimeout(400)
  await bench.shoot(nuit, 'b6-menu-sombre')
}
