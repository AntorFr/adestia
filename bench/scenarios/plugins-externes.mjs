/**
 * A plugin fetched from its own repository, seen from the browser.
 *
 * Unit tests prove git was driven correctly and that discovery reads several
 * roots. What they cannot say is that the whole chain holds end to end: the
 * clone is served under `/plugins/clock/`, the shell imports the module out of
 * it, and a tile for a plugin this image never shipped sits on the home beside
 * the ones it did.
 *
 * The second half is the refusal. A source that leads nowhere has to be SAID —
 * an activation that matched nothing, silently, is the failure the problems
 * band exists to prevent — and the sentence has to be in the reader's
 * language, which is where a translated code beats English prose in a log.
 *
 * See the `.prep.sh` beside this file for the two sources it boots with.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    const home = await bench.open({ theme, height: 1200 })
    await home.waitForSelector('.adestia-home')

    // The tile is the whole proof: `clock` is not in this image, its manifest
    // sat at the root of a repository called `adestia-plugin-clock`, and it
    // is on the launcher under its own name.
    await home.waitForSelector('text=Horloge')
    await bench.shoot(home, `1-tuile-du-depot-${theme}`)

    // And the refusal, in French, naming the address rather than a code.
    await home.waitForSelector('.adestia-problems--refused')
    await bench.shoot(home, `2-source-injoignable-${theme}`)
  }

  // The module itself, imported from the clone the server served.
  const page = await bench.open({ theme: 'light' })
  await page.waitForSelector('.adestia-home')
  await page.click('text=Horloge')
  await page.waitForSelector('h1:has-text("Horloge")')
  await bench.shoot(page, '3-ecran-du-plugin')
}
