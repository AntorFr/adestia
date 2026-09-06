/**
 * The seam on a folded shell.
 *
 * Folded, the two panes stack perfectly and nothing on screen admits that a
 * second one is waiting — the swipe that moves between them is discoverable
 * only by accident. These handles are that admission, and they are exactly
 * the kind of change a unit test cannot judge: jsdom loads no stylesheet, so
 * "both handles are in the DOM" is all it can say. Whether one is DRAWN,
 * where it sits, whether it is visible against the dark and whether it
 * shadows anything under it are questions for a browser.
 *
 * What each shot is for:
 *   1  the chat, with the handle that points at the canvas — and only it
 *   2  the canvas, with the handle pointing back — and only it
 *   3  the dark, where a faint bar is likeliest to disappear
 *   4  a desktop, which must draw no seam at all
 */

/** Every handle the shell holds, and what the browser does with it. */
const seams = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.adestia-edge')].map((el) => {
      const box = el.getBoundingClientRect()
      const pill = getComputedStyle(el, '::before')
      return {
        side: el.dataset.side,
        drawn: getComputedStyle(el).display !== 'none',
        target: `${Math.round(box.width)}×${Math.round(box.height)} at x=${Math.round(box.x)}`,
        bar: `${pill.width} ${pill.backgroundColor}`,
      }
    }),
  )

/** What a tap on that spot actually reaches — the handle, or what it covers. */
const under = (page, x, y) =>
  page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py)
      return el ? `${el.tagName.toLowerCase()}.${el.className}` : 'nothing'
    },
    [x, y],
  )

export default async function scenario(bench) {
  const phone = await bench.open({ width: 390, height: 844, touch: true })
  await phone.waitForSelector('.adestia-shell[data-screen="chat"]')
  console.log('on the chat:', JSON.stringify(await seams(phone)))
  // The strip is 16px of margin, not 16px of content: what answers a tap at
  // mid-height against the edge must be the handle itself.
  console.log('what a thumb reaches at the right edge:', await under(phone, 386, 422))
  await bench.shoot(phone, '1-chat-seam-right')

  await phone.click('.adestia-edge[data-side="right"]')
  await phone.waitForSelector('.adestia-shell[data-screen="canvas"]')
  console.log('on the canvas:', JSON.stringify(await seams(phone)))
  await bench.shoot(phone, '2-canvas-seam-left')

  // Back, by the handle rather than by the header button: the point of the
  // pair is that neither screen is a dead end.
  await phone.click('.adestia-edge[data-side="left"]')
  await phone.waitForSelector('.adestia-shell[data-screen="chat"]')
  console.log('the handle leads back:', await phone.getAttribute('.adestia-shell', 'data-screen'))

  const night = await bench.open({ width: 390, height: 844, touch: true, theme: 'dark' })
  await night.waitForSelector('.adestia-shell[data-screen="chat"]')
  console.log('in the dark:', JSON.stringify(await seams(night)))
  await bench.shoot(night, '3-chat-seam-dark')

  const desk = await bench.open({ width: 1280, height: 800 })
  console.log('on a desktop:', JSON.stringify(await seams(desk)))
  await bench.shoot(desk, '4-desktop-no-seam')
}
