/**
 * The catalogue pop-in, opened from Instructions: the list of declared
 * repositories, one repository's items, and the sheet on a phone and in the dark.
 *
 * The catalogue is declared through the API, from a local repository the prep
 * script mounts (a skill, an agent, a root instruction).
 */
export default async function scenario(bench) {
  // Built by catalogue-popin.prep.sh and mounted into the app container.
  const repo = 'file:///catalogue-src'
  const page = await bench.open()
  await page.goto(`${new URL(page.url()).origin}/#/settings/instructions`)
  await page.waitForSelector('.adestia-instructions')
  await page.getByRole('button', { name: 'Catalogues' }).click()
  await page.waitForSelector('.adestia-catalogues')
  await bench.shoot(page, '1-catalogues-empty')

  if (repo) {
    await bench.api('/api/instruction-catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ repo, ref: 'main' }),
    })
    await page.getByRole('button', { name: 'Fermer' }).click().catch(() => undefined)
    await page.getByRole('button', { name: 'Catalogues' }).click()
    await page.waitForSelector('.adestia-catalogues .adestia-filecard')
    await bench.shoot(page, '2-catalogues-declared')
    await page.locator('.adestia-catalogues .adestia-filecard').first().click()
    await page.waitForSelector('.adestia-catalogues__item', { timeout: 60_000 })
    await bench.shoot(page, '3-items')
    await page.locator('.adestia-catalogues__item button:enabled').first().click()
    await page.waitForTimeout(800)
    await bench.shoot(page, '4-imported')
  }

  const dark = await bench.open({ theme: 'dark' })
  await dark.goto(`${new URL(dark.url()).origin}/#/settings/instructions`)
  await dark.getByRole('button', { name: 'Catalogues' }).click()
  await dark.waitForSelector('.adestia-catalogues .adestia-filecard')
  await bench.shoot(dark, '5-dark')
  const phone = await bench.open({ width: 390, height: 844 })
  await phone.goto(`${new URL(phone.url()).origin}/#/settings/instructions`)
  await phone.getByRole('button', { name: 'Catalogues' }).click()
  await phone.waitForSelector('.adestia-catalogues .adestia-filecard')
  await bench.shoot(phone, '6-phone')
}
