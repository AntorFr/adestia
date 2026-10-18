/**
 * The workbench's two overlays: a piece's sheet and the bench mode.
 *
 * Seed `plugins` (a workbook, `caisson`, with derived pieces). The sheet has
 * to wear the shell's scrim and form, Escape has to close it and give the
 * focus back to the piece that opened it; the full-screen bench has to close
 * by Escape and by its button, which says where it leads. The assertions are
 * the point — the pictures are for looking.
 *
 *   node bench/launch.mjs --engine fake --seed plugins
 */
const check = (ok, what) => {
  if (!ok) throw new Error(`atelier-ecrans: ${what}`)
}

export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 900 })
    await page.goto(new URL('#/atelier/caisson', page.url()).href)
    await page.waitForSelector('.atelier-page .pname', { timeout: 15000 })

    await page.locator('.atelier-page .pname').first().focus()
    await page.keyboard.press('Enter')
    await page.waitForSelector('.atelier-sheet [role=dialog][aria-modal=true]')
    await bench.shoot(page, `${theme}-1-piece-sheet`)
    check(await page.evaluate(() => document.activeElement.getAttribute('aria-label') === 'Close'), 'focus does not start on the first control')
    await page.keyboard.press('Escape')
    check(await page.locator('.atelier-sheet').isHidden(), 'Escape does not close the sheet')
    check(await page.evaluate(() => document.activeElement.classList.contains('pname')), 'focus does not return to the piece')

    await page.click('#shopmode')
    await bench.shoot(page, `${theme}-2-bench-mode`)
    check(await page.evaluate(() => document.querySelector('.atelier-full').getAttribute('role') === 'dialog'), 'bench mode has no dialog role')
    await page.keyboard.press('Escape')
    check(await page.locator('.atelier-full').isHidden(), 'Escape does not leave the bench mode')
    await page.click('#shopmode')
    check((await page.locator('#atelier-close').innerText()).includes('Leave the bench mode'), 'the exit does not say where it leads')
    await page.click('#atelier-close')
    check(await page.locator('.atelier-full').isHidden(), 'the exit button does not leave')
  }
}
