/** Page states outside the sweep: hold the index, inject each page refusal. */
export default async function pagesStates({ page, url, shot, phone, locale }) {
  const canvas = async () => {
    await page.waitForSelector('.adestia-shell')
    if (phone && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
      await page.locator('.adestia-chat__header .adestia-ib').last().click()
    }
  }
  let release
  const held = new Promise((resolve) => { release = resolve })
  const pending = []
  await page.route('**/api/pages/index', (route) => {
    const request = held.then(() => route.continue())
    pending.push(request)
    return request
  })
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await canvas()
    await page.getByRole('status').filter({ hasText: locale === 'fr' ? 'Chargement…' : 'Loading…' }).waitFor()
    if (await page.locator('.adestia-home .adestia-tiles').count()) throw new Error('Mosaic drawn before ready')
    await shot('home-loading')
  } finally {
    release()
    await Promise.all(pending)
    await page.unroute('**/api/pages/index')
  }
  await page.waitForSelector('.adestia-home .adestia-tiles')
  await shot('home')
  for (const [name, route, proof] of [
    ['section', '/section/voyages', '.adestia-cards'],
    ['collection', '/page/projets/INDEX', '.adestia-collection'],
    ['finished', '/page/termines/INDEX', '.adestia-collection .adestia-archive'],
    ['inactive', '/bench-noview', '.adestia-empty .adestia-switch'],
  ]) {
    await page.evaluate((hash) => { location.hash = hash }, route)
    await page.waitForSelector(proof)
    await shot(name)
    if (name === 'section') {
      await page.locator('.adestia-search input').fill('no-page-can-match-this')
      await page.waitForSelector('.adestia-empty--state')
      await shot('section-no-match')
    }
  }
  await page.evaluate(() => { location.hash = '/section/empty-folder' })
  await page.waitForSelector('.adestia-home .adestia-empty--state')
  await shot('section-empty')
  for (const status of [404, 403, 500]) {
    await page.route('**/api/pages/**', (route) => route.fulfill({ status, contentType: 'application/json', body: '{}' }))
    await page.evaluate((hash) => { location.hash = hash }, `/page/missing/page-${status}`)
    await page.waitForSelector('.adestia-missing__path')
    await page.locator('.adestia-missing__path').filter({ hasText: `page-${status}` }).waitFor()
    await shot(`missing-${status}`)
    await page.unroute('**/api/pages/**')
  }
  await page.route('**/api/instance', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    await route.fulfill({ json: { ...body, plugins: [], pluginProblems: [] } })
  })
  await page.route('**/api/pages/index', (route) => route.fulfill({ json: { entries: [], stores: [] } }))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await canvas()
  await page.waitForSelector('.adestia-home .adestia-empty--state')
  await shot('home-empty')
}
