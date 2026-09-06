/**
 * The fold, crossed by a real finger.
 *
 * The reported defect was "it works one time in two", and no unit test could
 * have caught either half of it: jsdom has no compositor, so nothing there can
 * say whether the next screen actually ARRIVES under the thumb, and jsdom has
 * no scroll heuristics, so nothing there can say whether the browser stole the
 * gesture before the app read it.
 *
 * So this scenario drives Chromium's own touch input (CDP, the same events a
 * phone produces) and photographs the crossing WHILE THE FINGER IS DOWN —
 * which is the whole point of the change and the one state the previous
 * implementation could never be in.
 *
 * What each shot is for:
 *   1  the chat, before anything
 *   2  the finger half-way: two panes on screen at once, mid-track
 *   3  landed on the canvas
 *   4  the finger half-way back
 *   5  a vertical drag in the thread: the track must not have moved at all
 */

/** One finger, as the browser's own input layer sees it. */
const at = (x, y) => [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }]

/** What the shell is doing right now: where the track sits, and whether it is held. */
const track = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.adestia-shell')
    const edges = [...document.querySelectorAll('.adestia-edge')]
      .filter((e) => getComputedStyle(e).display !== 'none')
      .map((e) => `${e.dataset.side}@${Math.round(e.getBoundingClientRect().x)}`)
    return {
      // Two screens wide is the whole layout change: 390 here would mean the
      // stylesheet in the image is not the one this scenario is testing.
      track: getComputedStyle(el).width,
      screen: el.dataset.screen,
      held: el.dataset.swiping === 'true',
      matrix: getComputedStyle(el).transform,
      inline: el.style.transform,
      edges,
    }
  })

async function scenario(bench) {
  const phone = await bench.open({ width: 390, height: 844, touch: true })
  await phone.waitForSelector('.adestia-shell[data-screen="chat"]')
  const cdp = await phone.context().newCDPSession(phone)
  const touch = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : at(x, y) })

  console.log('at rest:', JSON.stringify(await track(phone)))
  await bench.shoot(phone, '1-chat')

  // Chat → canvas, held half-way. The steps matter: the direction lock reads
  // the first 8px, so a single jump would not exercise it.
  await touch('touchStart', 330, 520)
  for (const x of [322, 300, 270, 240, 210, 190]) await touch('touchMove', x, 522)
  const held = await track(phone)
  console.log('half-way, finger down:', JSON.stringify(held))
  await bench.shoot(phone, '2-half-way')

  await touch('touchEnd', 190, 522)
  await phone.waitForTimeout(600)
  console.log('landed:', JSON.stringify(await track(phone)))
  await bench.shoot(phone, '3-canvas')

  // And back, so the return leg is not taken on trust.
  await touch('touchStart', 60, 520)
  for (const x of [68, 90, 120, 150, 180, 200]) await touch('touchMove', x, 522)
  console.log('half-way back:', JSON.stringify(await track(phone)))
  await bench.shoot(phone, '4-half-way-back')
  await touch('touchEnd', 200, 522)
  await phone.waitForTimeout(600)
  console.log('landed back:', JSON.stringify(await track(phone)))

  // The refusal that matters most: reading the thread must stay reading.
  await touch('touchStart', 200, 600)
  for (const y of [592, 570, 540, 500, 460]) await touch('touchMove', 202, y)
  console.log('during a vertical drag:', JSON.stringify(await track(phone)))
  await touch('touchEnd', 202, 460)
  await phone.waitForTimeout(400)
  console.log('after it:', JSON.stringify(await track(phone)))
  await bench.shoot(phone, '5-vertical-untouched')
}

export default scenario
