/**
 * Les portes de l'écran d'entrée (E-1, E-21) : chargement, refus, panne, en
 * clair et en sombre, en anglais et en français, puis sur un téléphone.
 *
 * Le balayage couvre la connexion (oidc) et le démarrage hors ligne ; ce qu'il
 * ne couvre pas — le chargement, le refus 403, la panne réseau d'une instance
 * en ligne — est joué ici en interceptant `/api/instance`.
 */
const answer = {
  loading: (route) => new Promise(() => void route), // jamais de réponse
  refused: (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }),
  fatal: (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"the database is locked"}' }),
  network: (route) => route.abort('internetdisconnected'),
}

async function gate(bench, name, kind, opts) {
  const page = await bench.open(opts)
  await page.route('**/api/instance', answer[kind])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-gate__card .adestia-icon')
  await bench.shoot(page, name)
  await page.close?.()
}

export default async function scenario(bench) {
  for (const kind of Object.keys(answer)) {
    await gate(bench, `${kind}-light-en`, kind, { locale: 'en-US' })
    await gate(bench, `${kind}-dark-fr`, kind, { locale: 'fr-FR', theme: 'dark' })
    await gate(bench, `${kind}-phone`, kind, { width: 390, height: 844 })
  }
}
