/**
 * Régler l'instance depuis le navigateur, et vérifier que le FICHIER a bougé.
 *
 * Le produit refusait cet écran pour deux raisons. La première — un
 * sérialiseur rendrait à l'opérateur son fichier dépouillé de ses
 * commentaires — est levée par l'outil : on relit le document, on pose une
 * clé, on réimprime le reste tel quel. La seconde — le fichier est monté, donc
 * souvent en lecture seule — n'est pas levée, elle est DITE : l'écran l'annonce
 * avant qu'on remplisse un formulaire.
 *
 * Ce que ce banc ajoute aux tests unitaires, et qu'eux ne peuvent pas dire :
 * le fichier est ici un VRAI bind mount d'un seul fichier, comme dans le
 * compose et comme un ConfigMap. Un frère renommé par-dessus est refusé
 * (EBUSY) ; c'est le chemin de repli qui doit s'exécuter, pour de bon, et le
 * fichier de l'hôte doit changer.
 *
 * On regarde aussi à quoi ça RESSEMBLE, ce qu'aucun test ne dit : où se pose
 * la mention « par défaut », si la ligne « après un redémarrage » tient sur la
 * même ligne que son libellé, et si l'écran survit au noir.
 */

const ECRAN = '#/settings/config'

const ouvre = async (bench, theme = 'light') => {
  const page = await bench.open({ theme })
  await page.evaluate((cible) => {
    window.location.hash = cible
  }, ECRAN)
  await page.waitForSelector('.adestia-config__field', { timeout: 10_000 })
  await page.waitForTimeout(400)
  return page
}

/** Ce que le serveur dit du fichier — donc ce que le fichier dit. */
const surLeDisque = (page) =>
  page.evaluate(async () => {
    const answer = await fetch('/api/settings')
    const body = await answer.json()
    return {
      writable: body.writable,
      valeurs: Object.fromEntries(
        body.values.map((v) => [v.path.join('.'), `${v.value} (${v.source})`]),
      ),
    }
  })

export default async function scenario(bench) {
  const page = await ouvre(bench)
  console.log('  avant :', JSON.stringify(await surLeDisque(page)))
  await bench.shoot(page, '1-ecran-de-config')

  // Le geste : une case à cocher, pas un éditeur de texte.
  await page.locator('#setting-workspace\\.watch\\.polling').click()
  await page.waitForTimeout(200)
  await bench.shoot(page, '2-modifie-pas-encore-enregistre')

  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.waitForTimeout(1200)
  await bench.shoot(page, '3-ecrit-dans-le-fichier')

  // La preuve : le serveur relit le FICHIER après l'écriture. `(file)` veut
  // dire que la valeur y est écrite, et non tenue en mémoire par l'écran.
  const apres = await surLeDisque(page)
  console.log('  après :', JSON.stringify(apres))
  if (apres.valeurs['workspace.watch.polling'] !== 'true (file)') {
    throw new Error(`le fichier n'a pas été écrit : ${JSON.stringify(apres)}`)
  }

  // Et les commentaires de l'opérateur, qui sont la raison du refus d'origine.
  const conf = await page.evaluate(async () => {
    const answer = await fetch('/api/settings')
    return (await answer.json()).file
  })
  console.log('  fichier écrit :', conf)

  // Un nombre, pour voir le second type de contrôle et la borne qui le garde.
  await page.locator('#setting-workspace\\.watch\\.intervalMs').fill('5000')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.waitForTimeout(1200)
  console.log('  intervalle :', JSON.stringify((await surLeDisque(page)).valeurs))
  await bench.shoot(page, '4-un-nombre-borne')

  const sombre = await ouvre(bench, 'dark')
  await bench.shoot(sombre, '5-en-sombre')
}
