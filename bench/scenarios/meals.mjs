/**
 * The frise, photographed on the two things it claims to be at once.
 *
 * The plugin's whole argument is that planning a week of holiday meals and
 * logging what somebody actually ate are ONE screen — there is no mode field
 * anywhere in the format. That claim is not testable: it is a judgement about
 * whether the same frise reads right twice, and it is settled by looking.
 *
 * The other thing only a browser can say here is whether the card stayed
 * QUIET. A logged meal carries six nutrients and a planned dish carries four
 * ingredients; both are behind a click, and the day a `props` line leaks onto
 * a face, a week of logging becomes three screens of scrolling. Shots 2 and 3
 * are that pair — the face, then the same card opened.
 *
 * Pages, files and config come from `meals.prep.sh` beside this file. Nothing
 * is faked: this plugin has no engine to script, only files to read.
 */

const WEEK = '#/page/voyages/corse/semaine.md'
const LOG = '#/page/sante/semaine-type.md'
const INDEX = '#/page/voyages/corse/INDEX.md'
/** The period alone, by the address `vue="lien"` leads to. */
const ALONE = '#/meals/sante/septembre.meals.json'

const go = async (page, hash, selector = '.meals-card') => {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  // The block resolves its file on a fetch, so the page exists before it has
  // cards — waiting on the page alone would photograph an empty frise.
  await page.waitForSelector(selector, { timeout: 10_000 })
  await page.waitForTimeout(400)
}

export default async function scenario(bench) {
  const page = await bench.open({})

  // A week of menus inside the fiche that holds it — the frise on the left,
  // the tray of what the agent proposed on the right. No tile, no domain: the
  // block is simply part of the page.
  await go(page, WEEK)
  await bench.shoot(page, '1-week-in-a-page')

  // The face of a card, then the same card opened. Everything that makes a
  // shopping list — four ingredients and their quantities — is in the second
  // shot and none of it in the first. That is the arbitration to look at.
  await page.click('.meals-card')
  await page.waitForSelector('.meals-sheet', { timeout: 10_000 })
  await bench.shoot(page, '2-detail-open')
  await page.click('.meals-close')
  await page.waitForTimeout(200)

  // The same screen used the other way: what was actually eaten, four
  // sections because this file declares its own (the four o'clock biscuit is
  // the whole reason a log exists), grams on the faces and six nutrients
  // apiece hidden behind them.
  await go(page, LOG)
  await bench.shoot(page, '3-log-same-screen')

  await page.click('.meals-card')
  await page.waitForSelector('.meals-sheet', { timeout: 10_000 })
  await bench.shoot(page, '4-log-detail')
  await page.click('.meals-close')
  await page.waitForTimeout(200)

  // Addressable alone, which is what the daily gesture wants: logging a meal
  // should not mean opening a page and scrolling to a block. Same component,
  // no fiche around it, and a line saying where it is filed.
  await go(page, ALONE)
  await bench.shoot(page, '5-alone')

  // The compact form, so a fiche can cite a period without stacking a frise
  // into the middle of its prose.
  await go(page, INDEX, '.meals-lien')
  await bench.shoot(page, '6-cited-compact')

  // The whole week below the fold — a tall viewport rather than a fullPage
  // shot; see the bench README for why that does not work here.
  const tall = await bench.open({ height: 2400 })
  await go(tall, WEEK)
  await bench.shoot(tall, '7-week-whole')

  // The dark. The card's left edge is a hue token and the zones are the
  // shell's sunken surface, so both have to hold up without being repainted.
  const dark = await bench.open({ theme: 'dark' })
  await go(dark, LOG)
  await bench.shoot(dark, '8-log-dark')

  // Folded onto one screen, the two columns must become one. A tray squeezed
  // to a third of a phone is a column of truncated titles, which is worse
  // than a tray below the days.
  //
  // The canvas is behind the header's own button on a folded screen: setting
  // the hash alone mounts the page on the far side of the rail and
  // photographs the chat. The scenario makes the gesture a person makes —
  // and the first run of this bench photographed a blank phone for want of it.
  const phone = await bench.open({ width: 420, height: 900 })
  await phone.evaluate((target) => {
    window.location.hash = target
  }, WEEK)
  await phone.click('[aria-label="Open apps"]')
  await phone.waitForSelector('.meals-card', { timeout: 10_000 })
  await phone.waitForTimeout(400)
  await bench.shoot(phone, '9-week-phone')
}
