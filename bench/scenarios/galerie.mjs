/** The block gallery (E-34): Add block, search, empty search, insertion. */
export default async function galerie({ page, url, shot, phone }) {
  await page.goto(`${url}#/page/editeur/blocs`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.adestia-shell')
  if (phone && await page.locator('.adestia-shell').getAttribute('data-screen') !== 'canvas') {
    await page.locator('.adestia-chat__header .adestia-ib').last().click()
  }
  await page.waitForSelector('.adestia-reader', { timeout: 15_000 })
  await page.getByRole('button', { name: /^(Edit|Modifier)$/ }).first().click()
  await page.waitForSelector('.adestia-editor__surface .milkdown .ProseMirror', { timeout: 20_000 })
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: /^(Add block|Ajouter un bloc)/ }).first().click()
  await page.waitForSelector('.adestia-blockgallery', { timeout: 5_000 })
  await page.waitForTimeout(300)
  await shot('gallery')
  await page.locator('.adestia-blockgallery__search').fill('zzzzqq')
  await page.waitForTimeout(200)
  await shot('gallery-empty')
  await page.locator('.adestia-blockgallery__search').fill('')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.adestia-blockgallery', { state: 'detached', timeout: 5_000 })
  await page.waitForTimeout(500)
  await shot('inserted')
}
