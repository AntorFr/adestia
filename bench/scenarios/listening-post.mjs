/**
 * The listening post, photographed against a workspace that already holds a
 * corpus.
 *
 * What a unit test cannot say here, and this can: whether the queue reads as
 * one list or as three piles, whether a timestamped passage is legible as an
 * EXTRACT rather than as a wall of caption, whether the transcript panel eats
 * the page editor above it, and whether any of it survives the dark and a
 * phone.
 *
 * Nothing is faked but the engine, as always — and here not even the feeds:
 * `listening-post.prep.sh` files two of them in the workspace and points the
 * sources at the instance's own `/api/files`, so the fetch, the parse and the
 * "already filed, do not offer it again" rule all run for real.
 */

const HUB = '#/listening-post'

const go = async (page, hash, selector = '.lp') => {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await page.waitForSelector(selector, { timeout: 10_000 })
  // The library arrives on the page index, the queue on two feed fetches.
  await page.waitForTimeout(900)
}

export default async function scenario(bench) {
  // What the server actually assembled, printed rather than assumed: a shot
  // showing three cards proves nothing about WHICH three.
  const queue = await bench.api('/api/plugin/listening-post/queue')
  console.log('queue', JSON.stringify(queue.items?.map((item) => item.titre)))
  console.log('sources', JSON.stringify(queue.sources))

  const page = await bench.open({})
  // The tile before anybody opens it: what is kept, and the one figure that
  // runs hot — what is still waiting.
  await bench.shoot(page, '1-tile')

  await go(page, HUB)
  await page.waitForSelector('.lp-card', { timeout: 10_000 })
  // The hub: what was kept and is still waiting, then what the sources
  // published, then the drop box. The video already filed must NOT be in the
  // second list, under either spelling of its link.
  await bench.shoot(page, '2-hub')

  // The product, in one shot: a subject, and the seconds where it was said.
  await page.fill('.lp-seek input', 'résonance filtre')
  await page.press('.lp-seek input', 'Enter')
  await page.waitForSelector('.lp-passages li', { timeout: 10_000 })
  await bench.shoot(page, '3-extraits')

  // One item: the shell's own page editor, and the transcript under it. The
  // question is whether the panel reads as a source one CONSULTS rather than
  // as the page's content.
  await go(page, `${HUB}/moteur-audio`, '.lp-transcript')
  await page.waitForSelector('.lp-lines li', { timeout: 10_000 })
  await bench.shoot(page, '4-fiche')

  // Everything below the fold — the shell's canvas scrolls inside itself, so
  // a tall viewport rather than `fullPage` (see bench/README).
  const tall = await bench.open({ height: 2200 })
  await go(tall, HUB)
  await bench.shoot(tall, '5-hub-entier')

  const dark = await bench.open({ theme: 'dark' })
  await go(dark, HUB)
  await bench.shoot(dark, '6-sombre')

  // A card is a grid of three columns; on a phone the buttons must not push
  // the title into a single character per line. Folded onto one screen the
  // canvas is not on show — the phone opens on the thread, and the apps slide
  // in over it.
  const phone = await bench.open({ width: 390, height: 844 })
  await phone.evaluate((target) => {
    window.location.hash = target
  }, HUB)
  await phone.click('.adestia-ib[aria-label="Open apps"]')
  await phone.waitForSelector('.lp-card', { timeout: 10_000 })
  await phone.waitForTimeout(600)
  await bench.shoot(phone, '7-telephone')
}
