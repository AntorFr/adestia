/**
 * A REAL turn, on the real `codex` binary, photographed.
 *
 * Everything else in `bench/scenarios/` scripts the engine, because the image
 * ships none. This one does not: the server is on the host, armed with a real
 * credential, and what arrives in the thread is what the codex driver actually
 * produced. It exists because a driver is not looked at until somebody has
 * watched a real answer land — and because the tool TRACE is the thing this
 * engine renders differently from the other two (one shell tool where Claude
 * has Read/Edit/Grep), which no unit test can show.
 *
 * Run it with `bench/live-codex.sh`, never `bench/run.sh`.
 */
export default async function scenario(bench) {
  if (!bench.real) throw new Error('this scenario needs a real engine — use bench/live-codex.sh')

  const conversation = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Codex, pour de vrai' }),
  })
  const id = conversation.id ?? conversation.conversation?.id
  console.log('conversation', id)

  const page = await bench.open({ tab: id })
  await bench.shoot(page, 'codex-01-empty')

  // A question that makes the agent USE the shell, so the trace has something
  // in it: this engine's only file tool is a PTY shell, and how that reads is
  // the open question of the whole driver.
  const composer = page.locator('textarea, [contenteditable="true"]').first()
  await composer.click()
  await composer.fill('Dis bonjour en une phrase, puis liste les fichiers du dossier courant avec ls.')
  await bench.shoot(page, 'codex-02-typed')
  await page.keyboard.press('Enter')

  // The turn is real: it takes as long as it takes. Wait for the answer to
  // settle rather than for a number of seconds.
  await page.waitForTimeout(2500)
  await bench.shoot(page, 'codex-03-working')

  // The working indicator stays up for as long as the turn runs, UNDER
  // whatever has been said so far — so its disappearance is the signal, and
  // counting a selector that does not exist is not. (It did not exist in the
  // first version of this scenario, so `count() === 0` was true at once and
  // the run photographed a turn four seconds in.)
  let settled = false
  try {
    await page.waitForSelector('.adestia-bubble__working', { timeout: 30_000 })
    await page.waitForSelector('.adestia-bubble__working', { state: 'detached', timeout: 240_000 })
    settled = true
  } catch {
    settled = false
  }
  console.log(settled ? 'the turn settled' : 'the turn was still going when time ran out')
  await page.waitForTimeout(500)

  await bench.shoot(page, 'codex-04-answered')

  // The trace is collapsed by default, and the trace is the thing this engine
  // renders differently from the other two — so open it and look.
  const toggle = page.locator('.adestia-trace__toggle').first()
  if ((await toggle.count()) > 0) {
    await toggle.click()
    await page.waitForTimeout(300)
    await bench.shoot(page, 'codex-04b-trace')
    console.log('trace rows:', await page.locator('.adestia-trace__item').allInnerTexts())
  }
  // The same page in the dark, rather than a second one: a real turn holds its
  // SSE open, and opening another context to photograph the same thread costs
  // a second attach for nothing.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(300)
  await bench.shoot(page, 'codex-05-answered-dark')
  await page.emulateMedia({ colorScheme: 'light' })

  // What the thread actually holds, printed so the run says something even
  // when nobody opens the PNGs.
  const text = await page.locator('.adestia-chat').innerText()
  console.log('---- what the thread reads ----')
  console.log(text.slice(0, 2000))
}
