/**
 * The lots screen, photographed against two real repositories.
 *
 * What a unit test cannot say here, and this can: whether the alarm band
 * actually reads as an alarm above the lists, whether a row of five metadata
 * chips still leaves the title readable, whether any of it survives the dark,
 * and whether the whole thing fits a phone without the bands collapsing into
 * a wall of words.
 *
 * The repositories, the config and the mounts come from `lots.prep.sh` beside
 * this file — real git, real fiches, one of every awkward shape. Nothing here
 * is faked: this plugin has no engine to script, only a folder to read.
 */

/** The app's own route; the tile is on the launcher, the screen is under it. */
const HUB = '#/lots'

const go = async (page, hash) => {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await page.waitForSelector('.lots', { timeout: 10_000 })
  // The graph arrives on a fetch, so the section exists before it has rows.
  await page.waitForTimeout(600)
}

export default async function scenario(bench) {
  const page = await bench.open({})
  // The tile before anybody opens it: its subtitle is the question to decide
  // first, and exactly one of its figures runs hot.
  await bench.shoot(page, '1-tile')

  await go(page, HUB)
  await bench.shoot(page, '2-hub')

  // The alarm has to survive being one band among four. If "à trancher en
  // premier" reads as just another list here, the screen has failed at the
  // one thing it exists for.
  await page.waitForSelector('.lots-card', { timeout: 10_000 })
  await bench.shoot(page, '3-frozen-band')

  // The whole hub, fold and all: the bands below — what is under way, then
  // everything in the order to treat it, then the finished folded away — are
  // half the screen. A TALL viewport rather than a fullPage shot; see the
  // README for why that does not work here.
  const tall = await bench.open({ height: 2400 })
  await go(tall, HUB)
  await bench.shoot(tall, '4-hub-whole')

  // A fiche whose branch tip is fresher than main: the status shown is the
  // branch's, the prose is the coder's hand-back report, and the history is
  // git's rather than a field somebody maintains.
  await go(page, `${HUB}/tessera-1`)
  await bench.shoot(page, '5-fiche-from-a-branch')

  // The question that froze it — created on that same branch, and reachable
  // although `main` has never heard of it.
  await go(page, `${HUB}/tessera-q-cadre`)
  await bench.shoot(page, '6-question-raised-on-a-branch')

  // What the scan could not read, unfolded: two merged branches that are gone
  // and one fiche with a status that is not a status.
  await go(page, HUB)
  await page.click('.lots-problems-toggle')
  await page.waitForTimeout(200)
  await bench.shoot(page, '7-diagnostics')

  const dark = await bench.open({ theme: 'dark' })
  await go(dark, HUB)
  await bench.shoot(dark, '8-hub-dark')

  // Folded onto one screen, the canvas is not on show: the phone opens on the
  // chat, and the apps are behind the header's own button. Setting the hash
  // alone would photograph a section the reader cannot see — so the scenario
  // makes the gesture a person makes.
  const phone = await bench.open({ width: 420, height: 900 })
  await phone.evaluate((target) => {
    window.location.hash = target
  }, HUB)
  await phone.click('[aria-label="Open apps"]')
  await phone.waitForSelector('.lots-card', { timeout: 10_000 })
  await bench.shoot(phone, '9-hub-phone')
}
