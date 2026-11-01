/**
 * E-4's diagnostic and refused-save sentence, in the instance's language.
 * Run with pages-matrix.mjs; the unknown block comes from the real seed/API.
 * The save refusal and future plugin diagnostic are scripted HTTP responses.
 */
export default async function pageDiagnostics({ page, url, shot, phone, locale }) {
  const response = await page.request.get(`${url}/api/pages/blocs/tous-les-blocs.md`)
  if (!response.ok()) throw new Error(`Seed page: HTTP ${response.status()}`)
  const source = await response.json()
  const diagnostic = source.diagnostics.find((item) => item.message.startsWith('Unknown block ":::inconnu"'))
  if (!diagnostic) throw new Error('Seed has no unknown-block diagnostic')
  const expected = locale === 'fr'
    ? 'Bloc inconnu « :::inconnu ». Le vocabulaire est fermé ; l’étendre nécessite une modification du code.'
    : diagnostic.message
  const canvas = async () => {
    await page.waitForSelector('.adestia-shell')
    if (phone && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
      await page.locator('.adestia-chat__header .adestia-ib').last().click()
    }
  }
  await page.goto(`${url}/#/page/blocs/tous-les-blocs`)
  await canvas()
  const item = page.locator('.adestia-diagnostics__item').filter({ hasText: ':::inconnu' })
  await item.waitFor()
  await shot('diagnostic-read-only')
  const sentence = await item.evaluate((element) => {
    const copy = element.cloneNode(true)
    copy.querySelectorAll('svg, .adestia-diagnostics__line').forEach((node) => node.remove())
    return copy.textContent.trim()
  })
  if (sentence !== expected) throw new Error(`Read-only: expected ${JSON.stringify(expected)}, got ${JSON.stringify(sentence)}`)

  await page.route('**/api/pages/pieces/dossier*', (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 422, json: { diagnostics: [diagnostic] } })
    : route.continue())
  await page.goto(`${url}/#/page/pieces/dossier`)
  await canvas()
  await page.locator('.adestia-editor__actions .adestia-btn').first().click()
  const editor = page.locator('.adestia-editor__surface .ProseMirror[contenteditable="true"]').first()
  await editor.click()
  await editor.press('Control+End')
  await editor.press('Enter')
  await editor.pressSequentially('Diagnostic bench')
  const status = page.locator('.adestia-save--error')
  await status.waitFor()
  const saveSentence = (await status.textContent()).trim()
  const refused = `${locale === 'fr' ? 'Non enregistré : ' : 'Not saved: '}${expected}`
  if (saveSentence !== refused) throw new Error(`Save: expected ${JSON.stringify(refused)}, got ${JSON.stringify(saveSentence)}`)
  await shot('diagnostic-save-refused')

  const fallback = 'Plugin diagnostic: :::inconnu, %block, $&.'
  await page.route('**/api/pages/blocs/tous-les-blocs*', (route) => route.fulfill({ json: {
    ...source,
    diagnostics: [{ severity: 'error', code: 'future-plugin-code', args: { block: 'inconnu' }, message: fallback }],
  } }))
  await page.goto(`${url}/#/page/blocs/tous-les-blocs`)
  await canvas()
  await page.locator('.adestia-diagnostics__item').waitFor()
  if ((await page.locator('.adestia-diagnostics__item').textContent()).trim() !== fallback) {
    throw new Error('Unknown code changed the received sentence')
  }
  await shot('diagnostic-unknown-code')
}
