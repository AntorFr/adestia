/**
 * The background reach's banner — the failure nobody was awake for.
 *
 * The prep flags `google` as `background` in a deployment that keeps no user
 * keys, and plants an expired mission: the clock's first tick spawns a
 * caller-less turn, the mint is refused (`no-rebound`), and the next person
 * to open the shell must find that said — dated, in their language, on both
 * folded screens and in the dark.
 */
export default async function scenario(bench) {
  // The clock's first tick sets the trouble; poll the API rather than sleep
  // a guessed amount.
  let trouble
  for (let attempt = 0; attempt < 30 && !trouble; attempt++) {
    trouble = (await bench.api('/api/instance')).backgroundTrouble
    if (!trouble) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.log('the server holds:', JSON.stringify(trouble))

  const desk = await bench.open({ width: 1280, height: 900 })
  await desk.waitForSelector('.adestia-problems')
  console.log(
    'the banner says:',
    await desk.$eval('.adestia-problems', (el) => el.textContent),
  )
  await bench.shoot(desk, '1-fond-en-panne')

  // On a phone the canvas is BEHIND the chat; the banner must survive the
  // fold, not only the wide screen.
  const phone = await bench.open({ width: 390, height: 844, touch: true })
  await phone.click('.adestia-edge[data-side="right"]')
  // Wait for the FOLD, not the selector: the banner exists in the DOM while
  // the canvas is still behind the chat, and a shot taken then shows nothing.
  await phone.waitForSelector('.adestia-shell[data-screen="canvas"]')
  // And for the slide to finish painting — the state flips before the
  // transition ends, and a shot in between photographs the closing chat.
  await phone.waitForTimeout(600)
  await phone.waitForSelector('.adestia-problems')
  await bench.shoot(phone, '2-fond-en-panne-phone')

  const night = await bench.open({ width: 1280, height: 900, theme: 'dark' })
  await night.waitForSelector('.adestia-problems')
  await bench.shoot(night, '3-fond-en-panne-dark')
}
