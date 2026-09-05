/**
 * The two card families, after they stopped sharing a class name.
 *
 * `.adestia-card` named TWO unrelated components — the page cards of a section
 * and the file cards of the instruction zone — and each was overriding the
 * other: the page cards had lost their radius, their padding and the layout of
 * their foot; the file cards had inherited a 96px floor, a shadow and a hover
 * lift they never asked for. Renaming one family changes what BOTH draw, and
 * no unit test says where a thing sits.
 *
 * So: both families, both themes, in one scenario. `settings-split` shoots the
 * instruction cards too, but in light only — and the dark is exactly where a
 * component that just lost a shadow and a hover lift can come apart.
 */
async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(700)
}

export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme, height: 1400 })
    await page.waitForSelector('.adestia-home')
    // A folder with an index page AND thirteen cards under it: the index gives
    // the screen its head, the cards are what this scenario is about.
    await go(page, '/section/domaines/sante')
    await page.waitForSelector('.adestia-card__title')
    await bench.shoot(page, `1-section-cards-${theme}`)

    // The other family, in the same run and the same theme: what was one class
    // is now two, and only a picture of both says the split landed.
    await go(page, '/settings/instructions')
    await page.waitForSelector('.adestia-filecard__path')
    await bench.shoot(page, `2-instruction-cards-${theme}`)
  }
}
