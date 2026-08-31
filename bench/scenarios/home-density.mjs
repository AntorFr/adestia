/**
 * The landing canvas, photographed on a real corpus.
 *
 * "Moche et pas pratique à explorer" is a symptom, not a spec, and it is not
 * earnable on the empty instance the other scenarios boot. This one seeds the
 * density the complaint came from (see the .prep.sh beside it) and takes the
 * pictures a diagnosis can be argued from — full height, both themes, phone.
 */
export default async function scenario(bench) {
  for (const theme of ['light', 'dark']) {
    // What a person actually gets: one screen, and what it spends itself on.
    const fold = await bench.open({ theme })
    await fold.waitForSelector('.adestia-home')
    await bench.shoot(fold, `1-above-the-fold-${theme}`)

    // Then the whole canvas at once. Scrolling was the obvious move and it
    // does nothing: the page does not scroll on `body`, an inner container
    // does — a tall viewport photographs the lot without guessing which.
    const whole = await bench.open({ theme, height: 2200 })
    await whole.waitForSelector('.adestia-home')
    await whole.waitForTimeout(500)
    await bench.shoot(whole, `2-whole-canvas-${theme}`)
  }

  // No phone shot here, and no descent into a section: on a narrow viewport
  // the canvas sits behind the chat (the shell's split), so `.adestia-home`
  // never appears and the wait times out. That layout deserves its own
  // scenario driving the shell's own gesture rather than a guess bolted onto
  // this one — what this scenario is for is DENSITY, at desk width.
}
