/**
 * The page, read and written, with its two windows (E-4, E-5, E-6).
 *   node bench/scenarios/pages-matrix.mjs bench/scenarios/pages-editor.mjs
 * Reading with every kind of block, with attachments, read-only with its
 * diagnostics, the editor open, E-6 on a block, E-5 on the page, and the
 * conflict line. Each state is a picture; Escape and the focus are asserted.
 */
export default async function pagesEditor({ page, url, shot, phone, locale }) {
  const words = locale === 'fr'
    ? { edit: 'Modifier', settings: 'Réglages du bloc', props: 'Propriétés de la fiche' }
    : { edit: 'Edit', settings: 'Block settings', props: 'Page properties' }
  const canvas = async () => {
    await page.waitForSelector('.adestia-shell')
    if (phone && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
      await page.locator('.adestia-chat__header .adestia-ib').last().click()
    }
  }
  const open = async (path, proof) => {
    await page.goto(`${url}#/page/${path}`, { waitUntil: 'domcontentloaded' })
    await canvas()
    await page.waitForSelector(proof, { timeout: 15_000 })
    await page.waitForTimeout(300)
  }
  const edit = async () => {
    await page.getByRole('button', { name: words.edit, exact: true }).first().click()
    await page.waitForSelector('.adestia-editor__surface .milkdown .ProseMirror', { timeout: 20_000 })
    await page.waitForTimeout(800)
  }
  const focusedLabel = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)

  await open('editeur/blocs', '.adestia-reader')
  await shot('page-blocks')
  await open('pieces/dossier', '.adestia-list--files, .adestia-page-files')
  await shot('page-attachments')
  await open('blocs/vocabulaire-casse', '.adestia-editor__raw')
  await shot('page-readonly')

  await open('editeur/blocs', '.adestia-reader')
  await edit()
  await shot('editor')

  // E-6: the settings of the first block, hung from its button.
  const block = page.locator('.adestia-edblock').first()
  await block.hover()
  const gear = block.locator('.adestia-edblock__gear').first()
  await gear.click()
  await page.waitForSelector('.adestia-blockset', { timeout: 5_000 })
  await page.waitForTimeout(300)
  await shot('block-settings')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.adestia-blockset', { state: 'detached' })
  const back = await focusedLabel()
  if (back !== words.settings) throw new Error(`focus did not return to the block's settings button: ${back}`)

  // E-5: the page's properties.
  await open('proprietes/toutes', '.adestia-reader')
  await edit()
  const props = page.locator('.adestia-editor__meta-gear').first()
  await props.click()
  await page.waitForSelector('.adestia-blockset--page', { timeout: 5_000 })
  await page.waitForTimeout(300)
  await shot('page-settings')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.adestia-blockset--page', { state: 'detached' })
  const backProps = await focusedLabel()
  if (backProps !== words.props) throw new Error(`focus did not return to the properties button: ${backProps}`)

  // The conflict line: the server says the agent wrote first.
  await page.route('**/api/pages/**', (route) =>
    route.request().method() === 'PUT' ? route.fulfill({ status: 409, contentType: 'application/json', body: '{}' }) : route.continue())
  await page.locator('.adestia-editor__surface .ProseMirror').click()
  await page.keyboard.press('End')
  await page.keyboard.type(' x')
  await page.waitForSelector('.adestia-save--warn', { timeout: 10_000 })
  await shot('page-conflict')
  await page.unroute('**/api/pages/**')
}
