/**
 * The configuration screen (E-14) and the delegations list (E-13) at the
 * charter's level.
 *
 * What no unit test says, and what each shot is for:
 *
 * - the wait before the form: the response is held back, so the loading state
 *   (a spinner in the tile's colour) can be looked at instead of inferred;
 * - the error and empty renderings wear the tile's colour like the header;
 * - the form with the shell's buttons, switches, fields — no grey native
 *   control, in the dark too;
 * - every state of the restart band with its icon: waiting, blocked, failed,
 *   coming back. The server's restart and health answers are scripted in the
 *   browser, so nothing here restarts the instance;
 * - the delegations list with its state chips.
 *
 * Seed `config-writable` for the form; run again on `config-readonly` for the
 * read-only notice. Each run takes the pictures of the language it is given
 * (BENCH_LOCALE), so en and fr are two runs.
 */

const go = async (page, hash) => {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(600)
}

/** A page whose first read of the settings is held back until `release()`. */
async function holding(bench, options) {
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  const page = await bench.open(options)
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'GET') await held
    await route.continue()
  })
  return { page, release }
}

export default async function scenario(bench) {
  // ── Loading, then the form ──────────────────────────────────────────────
  const { page: slow, release } = await holding(bench)
  await go(slow, '/settings/config')
  await slow.waitForSelector('.adestia-config__loading')
  await bench.shoot(slow, '1-config-loading')
  release()
  await slow.waitForSelector('.adestia-config__field')
  await bench.shoot(slow, '2-config-form')

  // ── A write that waits for a restart, and each state of the band ───────
  const answers = [
    { status: 409, body: { error: 'turns running', running: 2 } },
    { status: 500, body: { error: 'no' } },
    { status: 202, body: {} },
  ]
  await slow.route('**/api/restart', (route) => route.fulfill({ ...(({ status, body }) => ({ status, contentType: 'application/json', body: JSON.stringify(body) }))(answers.shift()) }))
  await slow.route('**/api/health', () => new Promise(() => {}))
  const restartKey = await slow.evaluate(async () => {
    const body = await (await fetch('/api/settings')).json()
    const spec = body.groups.flatMap((g) => g.settings).find((s) => s.applies === 'restart' && s.kind === 'toggle')
    return spec?.path.join('.')
  })
  const locked = (await slow.locator('.adestia-config__locked').count()) > 0
  if (restartKey && !locked) {
    await slow.locator(`#setting-${restartKey.replaceAll('.', '\\.')}`).click()
    await bench.shoot(slow, '3-config-edited')
    await slow.getByRole('button', { name: /^(Save|Enregistrer)$/ }).click()
    await slow.waitForSelector('.adestia-config__restart-bar')
    await bench.shoot(slow, '4-restart-pending')
    const restart = slow.locator('.adestia-config__restart-bar .adestia-btn')
    await restart.click()
    await slow.waitForSelector('.adestia-config__restart-bar [role=alert]')
    await bench.shoot(slow, '5-restart-blocked')
    await restart.click()
    await slow.waitForSelector('.adestia-config__restart-bar [role=alert]')
    await bench.shoot(slow, '6-restart-failed')
    await restart.click()
    await slow.waitForTimeout(500)
    await bench.shoot(slow, '7-restart-waiting')
  }

  // ── Dark, and a phone ───────────────────────────────────────────────────
  const dark = await bench.open({ theme: 'dark' })
  await go(dark, '/settings/config')
  await dark.waitForSelector('.adestia-config__field, .adestia-config__locked')
  await bench.shoot(dark, '8-config-dark')
  const phone = await bench.open({ width: 390, height: 844, touch: true })
  await go(phone, '/settings/config')
  // On a phone the canvas is the second screen: the header's "Open apps" button brings it.
  await phone.locator('.adestia-ib[aria-label="Open apps"], .adestia-ib[aria-label="Ouvrir les applis"]').first().click()
  await phone.waitForSelector('.adestia-config__field, .adestia-config__locked')
  await phone.waitForTimeout(600)
  await bench.shoot(phone, '9-config-phone')

  // ── An error and an empty answer, in the tile's colour ─────────────────
  const broken = await bench.open()
  await broken.route('**/api/settings', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }))
  await go(broken, '/settings/config')
  await broken.waitForSelector('.adestia-empty--state')
  await bench.shoot(broken, '10-config-error')

  // ── Delegations: the state chips ────────────────────────────────────────
  const list = await bench.open()
  await list.route('**/api/delegations', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        delegations: [
          { caller: 'skippy', id: 'a', title: 'Vérifie le chart Helm', updatedAt: new Date().toISOString(), turn: 'running' },
          { caller: 'skippy', id: 'b', title: 'Range les captures', updatedAt: '2026-09-01T09:12:00.000Z', turn: 'waiting' },
          { caller: 'nestor', id: 'c', title: 'La liste des courses', updatedAt: '2026-09-04T18:40:00.000Z' },
        ],
      }),
    }),
  )
  await go(list, '/settings/delegations')
  await list.waitForSelector('.adestia-deleg__state')
  await bench.shoot(list, '11-delegations-chips')
}
