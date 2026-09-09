/**
 * Quel bloc vide la zone d'édition.
 *
 * Six entrées, une par bloc du cœur plus un témoin. On ouvre le ✎ de chacune,
 * l'une après l'autre, et on relève ce que la surface contient VRAIMENT. Le
 * code annonce la panne ; seul le navigateur dit à quoi elle ressemble.
 */
export default async function scenario(bench) {
  const page = await bench.open({ height: 2400 })
  await page.evaluate(() => {
    window.location.hash = '/journal/atelier'
  })
  await page.waitForSelector('.journal-entry', { timeout: 20_000 })
  await page.waitForTimeout(1500)
  await bench.shoot(page, 'b1-lecture')

  const titres = await page.$$eval('.journal-entry__title', (nodes) => nodes.map((n) => n.textContent))
  console.log('[blocs] entrées —', JSON.stringify(titres))

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

  // ── Le menu « / » ────────────────────────────────────────────────────────
  // Ce que le menu OFFRE ne se lit dans aucun test unitaire : il faut le voir
  // posé sur la page, avec ses glyphes.
  const temoin = page.locator('.journal-entry').last()
  await temoin.locator('button[title="Modifier"]').click()
  await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 15_000 })
  // Le curseur doit être au bout du BLOC : `shouldShow` refuse le menu partout
  // ailleurs (`isSelectionAtEndOfNode`). `End` ne va qu'au bout de la ligne
  // VISIBLE et coupe un mot en deux sur un paragraphe replié ; `Ctrl+A` puis
  // une flèche ne replie pas la sélection dans ProseMirror et la frappe
  // suivante REMPLACE le document — les deux essais sont dans l'historique.
  // Un clic en bas à droite du dernier paragraphe fait ce qu'une main fait.
  const fin = await temoin.locator('.ProseMirror p').last().boundingBox()
  await page.mouse.click(fin.x + fin.width - 2, fin.y + fin.height - 4)
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.waitForTimeout(900)
  // Notre onglet, ouvert : c'est là que se voient les cinq glyphes ensemble.
  await page.locator('.milkdown-slash-menu .tab-group li:has-text("Blocs")').click()
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

  // Insérer, enregistrer, relire le FICHIER. C'est la seule preuve que le nœud
  // renommé se resérialise en `:::table` et pas en autre chose.
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  await bench.shoot(page, 'b5-bloc-insere')
  await temoin.locator('button:has-text("Enregistrer")').click()
  await page.waitForTimeout(1500)

  const ecrit = await bench.api('/api/pages/journal/atelier/2026-09-01-0800.md')
  console.log('[insertion] fichier après enregistrement —')
  console.log(String(ecrit.markdown ?? ecrit.error ?? JSON.stringify(ecrit)).trim())

  // Et l'aller-retour d'une entrée qui portait DÉJÀ un bloc : on y touche une
  // lettre et on regarde si le `:::table` a survécu au renommage du nœud.
  const avecTable = page.locator('.journal-entry').nth(1)
  await avecTable.locator('button[title="Modifier"]').click()
  await page.waitForSelector('.adestia-editor__surface .ProseMirror', { timeout: 15_000 })
  const bout = await avecTable.locator('.ProseMirror p').last().boundingBox()
  await page.mouse.click(bout.x + bout.width - 2, bout.y + bout.height - 4)
  await page.keyboard.type(' Encore.')
  await page.waitForTimeout(500)
  await avecTable.locator('button:has-text("Enregistrer")').click()
  await page.waitForTimeout(1500)

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
  const coin = await soir.locator('.ProseMirror p').last().boundingBox()
  await nuit.mouse.click(coin.x + coin.width - 2, coin.y + coin.height - 4)
  await nuit.keyboard.press('Enter')
  await nuit.keyboard.type('/')
  await nuit.waitForTimeout(900)
  await nuit.locator('.milkdown-slash-menu .tab-group li:has-text("Blocs")').click()
  await nuit.waitForTimeout(400)
  await bench.shoot(nuit, 'b6-menu-sombre')
}
