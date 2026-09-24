/**
 * Les propriétés d'une fiche, éditées au formulaire.
 *
 * Ce qu'aucun test ne dit : si le ⚙ se voit sur la bande de pastilles, si le
 * panneau tient dans le canevas, s'il survit au sombre (un sélecteur de date
 * est un contrôle NATIF, et il était blanc sur fond noir), et si une fiche
 * sans frontmatter a bien un point d'entrée.
 *
 * Et une chose qu'un test unitaire ne peut pas dire non plus : ce qui arrive
 * DANS LE FICHIER. Le scénario relit la page par l'API après avoir cliqué,
 * pour vérifier que le commentaire et la structure imbriquée sont toujours là.
 */
const SERVANTE = '/page/domaines/diy/projets/servante/INDEX.md'
const TACHE = '/page/domaines/diy/projets/servante/chant.md'
const NOTE = '/page/domaines/diy/projets/servante/note.md'

const open = async (bench, page, route, waitFor) => {
  await page.evaluate((to) => {
    location.hash = to
  }, route)
  await page.waitForSelector(waitFor, { timeout: 20_000 })
}

export default async function scenario(bench) {
  const page = await bench.open({ width: 1800, height: 1400 })
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message))

  await open(bench, page, SERVANTE, 'text=Servante')
  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__meta--edit', { timeout: 20_000 })
  await page.waitForTimeout(1200)
  await bench.shoot(page, '1-la-bande-porte-son-reglage')

  await page.click('.adestia-editor__meta-gear')
  await page.waitForSelector('.adestia-blockset--page', { timeout: 5_000 })
  await page.waitForTimeout(400)
  await bench.shoot(page, '2-les-proprietes')

  // Les listes sortent de l'index, pas du code : `domaine` doit connaître les
  // deux mots que le corpus écrit, et rien d'autre.
  const domaines = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.adestia-blockset__field')].find(
      (one) => one.querySelector('span')?.textContent === 'Domaine',
    )
    return [...(row?.querySelector('select')?.options ?? [])].map((one) => one.textContent)
  })
  console.log('domaines proposés:', JSON.stringify(domaines))

  // Un état choisi s'écrit dans le fichier, et rien d'autre ne bouge.
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.adestia-blockset__field')].find(
      (one) => one.querySelector('span')?.textContent === 'État',
    )
    const select = row?.querySelector('select')
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, 'terminé')
    select?.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForTimeout(2600) // l'enregistrement automatique
  await bench.shoot(page, '3-un-etat-choisi')

  const written = await bench.api(`/api/pages/domaines/diy/projets/servante/INDEX.md`)
  const head = String(written.markdown).split('---')[1] ?? ''
  console.log('écrit:', JSON.stringify(head))
  for (const [what, ok] of [
    ['status terminé', /^status: terminé$/m.test(head)],
    ['le commentaire', /# la fiche elle-même/.test(head)],
    ['la structure imbriquée', /hauteur: 1000/.test(head)],
    ['le titre intact', /^title: Servante d'atelier sur roulettes$/m.test(head)],
  ]) {
    console.log(ok ? `  ✓ ${what}` : `  ✗ ${what} — PERDU`)
  }

  // Une tâche : les champs que le plugin déclare, dont une référence peuplée
  // par les projets de l'instance.
  await open(bench, page, TACHE, 'text=Chêne massif')
  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__meta--edit', { timeout: 20_000 })
  await page.click('.adestia-editor__meta-gear')
  await page.waitForSelector('.adestia-blockset--page', { timeout: 5_000 })
  await page.waitForTimeout(400)
  await bench.shoot(page, '4-une-tache-et-ses-champs-de-plugin')

  const projets = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.adestia-blockset__field')].find(
      (one) => one.querySelector('span')?.textContent === 'Project',
    )
    return [...(row?.querySelector('select')?.options ?? [])].map((one) => one.textContent)
  })
  console.log('projets proposés:', JSON.stringify(projets))

  // Une fiche SANS frontmatter : c'est celle qui n'avait aucun point d'entrée.
  await open(bench, page, NOTE, 'text=Trois lignes')
  await page.click('button[title="Modifier"]')
  await page.waitForSelector('.adestia-editor__meta--edit', { timeout: 20_000 })
  await page.waitForTimeout(600)
  await bench.shoot(page, '5-une-fiche-qui-ne-declare-rien')
  await page.click('.adestia-editor__meta-gear')
  await page.waitForSelector('.adestia-blockset--page', { timeout: 5_000 })
  await page.waitForTimeout(300)
  await bench.shoot(page, '6-et-son-formulaire')

  // Le sombre, où le sélecteur de date était un bloc blanc.
  const dark = await bench.open({ theme: 'dark', width: 1800, height: 1400 })
  await open(bench, dark, TACHE, 'text=Chêne massif')
  await dark.click('button[title="Modifier"]')
  await dark.waitForSelector('.adestia-editor__meta--edit', { timeout: 20_000 })
  await dark.click('.adestia-editor__meta-gear')
  await dark.waitForSelector('.adestia-blockset--page', { timeout: 5_000 })
  await dark.waitForTimeout(400)
  await bench.shoot(dark, '7-en-sombre')
}
