/**
 * A period of meals, photographed as what it now is: a PAGE.
 *
 * Three claims, and none of them is testable — each is settled by looking.
 *
 * That one screen serves two opposite jobs. Planning a holiday week and
 * logging what somebody ate share a frise, a tray and a format with no mode
 * field anywhere. Shots 1 and 3 are that pair, and if the second reads wrong
 * the claim is wrong.
 *
 * That the card stayed QUIET. A logged meal carries six nutrients and a
 * planned dish four ingredients; both are behind a click. Shots 2 and 4 are
 * the face and the same card opened.
 *
 * And that a period is still a page. Shot 5 is the pencil: the plugin owns
 * the reading posture and the shell still owns the document, so a wrong date
 * in the frontmatter is corrected here rather than by hunting for a file.
 * That one is the whole architecture in a single screenshot.
 *
 * Pages, files and config come from `meals.prep.sh` beside this file. Nothing
 * is faked: this plugin has no engine to script, only files to read.
 */

const WEEK = '#/page/voyages/corse/semaine.md'
const LOG = '#/page/sante/semaine-type.md'
const FOLDER = '#/section/voyages/corse'

const go = async (page, hash, selector = '.meals-card') => {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  // The frise resolves its cards on a fetch, so the page exists before it has
  // any — waiting on the page alone would photograph an empty grid.
  await page.waitForSelector(selector, { timeout: 10_000 })
  await page.waitForTimeout(400)
}

export default async function scenario(bench) {
  const page = await bench.open({})

  // A week of menus, filed in the trip it belongs to. No tile, no domain, no
  // block in the body: the page's `type` is the whole declaration.
  await go(page, WEEK)
  await bench.shoot(page, '1-week-is-a-page')

  // The face, then the same card opened. Everything a shopping list is made
  // of is in the second shot and none of it in the first.
  await page.click('.meals-card')
  await page.waitForSelector('.meals-sheet', { timeout: 10_000 })
  await bench.shoot(page, '2-detail-open')
  await page.click('.meals-close')
  await page.waitForTimeout(200)

  // The same screen used the other way: what was actually eaten, four sections
  // because THIS page declares four (the four o'clock biscuit is the whole
  // reason a log exists), grams on the faces and six nutrients behind them.
  await go(page, LOG)
  await bench.shoot(page, '3-log-same-screen')

  await page.click('.meals-card')
  await page.waitForSelector('.meals-sheet', { timeout: 10_000 })
  await bench.shoot(page, '4-log-detail')
  await page.click('.meals-close')
  await page.waitForTimeout(200)

  // The pencil. A layout owns the reading posture and nothing else, so the
  // document is never stranded: this is where a date, a section or the prose
  // gets fixed, in the editor every other page uses.
  // By its glyph, not by its title: the title is translated, and this bench
  // runs a French instance.
  await page.click('.adestia-editor__actions .adestia-ib')
  await page.waitForSelector('.adestia-editor__surface', { timeout: 10_000 })
  await page.waitForTimeout(500)
  await bench.shoot(page, '5-still-a-page')

  // Filed among ordinary fiches, reached by an ordinary link. A period needs
  // nothing from the plugin to be found. A FRESH page: the previous one is
  // still in writing posture, and navigating out of it is not what this shot
  // is about.
  const folder = await bench.open({})
  await go(folder, FOLDER, '.adestia-crumbs')
  await bench.shoot(folder, '6-in-its-folder')

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

  // Folded onto one screen, the two columns must become one. The canvas is
  // behind the header's own button there: setting the hash alone photographs
  // the chat, which is what the first run of this bench did.
  const phone = await bench.open({ width: 420, height: 900 })
  await phone.evaluate((target) => {
    window.location.hash = target
  }, WEEK)
  await phone.click('[aria-label="Open apps"]')
  await phone.waitForSelector('.meals-card', { timeout: 10_000 })
  await phone.waitForTimeout(400)
  await bench.shoot(phone, '9-week-phone')
}
