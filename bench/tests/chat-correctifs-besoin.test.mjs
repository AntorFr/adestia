/**
 * adestia-correctifs-chat, the need seen from outside: B-14 (P-2 step 4: a refused turn is
 * explained), B-13 (the chat's register: `📎` text, delegations' signatures, CSS leftovers,
 * `upload failed`, the composer's focus), B-15 (the CHANGELOG says it), B-16 (four skins, `en` and
 * `fr`, both themes, desk and phone). Every expectation is a literal written from docs/parcours.md,
 * docs/ecrans.md and the feature's exit criterion; the engine is the scripted one (bench/seed).
 *
 *   npm run build && node --test bench/tests/chat-correctifs-besoin.test.mjs
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shots = join(root, 'bench/shots-besoin')

function loadPlaywright() {
  const roots = ['/usr/lib/node_modules']
  try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()) } catch { /* fixed root only */ }
  for (const dir of roots) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return createRequire(`${dir}/`)(name) } catch { /* not here */ }
    }
  }
  throw new Error('playwright not found in the environment')
}
const { chromium } = loadPlaywright()

function startInstance(seed, skin, locale) {
  return new Promise(async (resolveStart, reject) => {
    const data = await mkdtemp(join(tmpdir(), 'besoin-correctifs-chat-'))
    const child = spawn('node', ['bench/launch.mjs', '--engine', 'fake', '--seed', seed, '--skin', skin, '--locale', locale, '--data', data], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    let log = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`instance did not start:\n${log}`)) }, 120_000)
    child.stdout.on('data', (chunk) => {
      log += chunk
      const match = /listening on (http:\/\/\S+)\n/.exec(log)
      if (match && !/Adestia listening on/.test(match[0])) {
        clearTimeout(timer)
        resolveStart({ url: match[1], stop: () => new Promise((done) => { child.once('exit', done); child.kill('SIGTERM') }).then(() => rm(data, { recursive: true, force: true })) })
      }
    })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`instance exited ${code}:\n${log}`)) })
  })
}

const shot = async (page, name) => { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, name) }).catch(() => {}) }

const DESK = { viewport: { width: 1440, height: 900 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }

const W = {
  en: { newConversation: 'New conversation', refusal: (n) => `Turn limit reached (${n} at a time) — try again in a moment.` },
  fr: { newConversation: 'Nouvelle conversation', refusal: (n) => `Limite de tours atteinte (${n} à la fois) — réessayez dans un instant.` },
}

const isTurnPost = (r) => new URL(r.url()).pathname === '/api/turn' && r.request().method() === 'POST'
const isConversationRead = (r) => /^\/api\/conversations\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === 'GET'

/** Contrast of a node's text over its composed ancestors' backgrounds. */
async function contrastRatio(locator) {
  return locator.evaluate((node) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const rgb = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3)
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, 1, 1)
    const chain = []
    for (let n = node; n; n = n.parentElement) chain.unshift(n)
    for (const n of chain) { ctx.fillStyle = getComputedStyle(n).backgroundColor; ctx.fillRect(0, 0, 1, 1) }
    const back = rgb()
    ctx.fillStyle = getComputedStyle(node).color
    ctx.fillRect(0, 0, 1, 1)
    const front = rgb()
    const lum = (c) => c.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
    const a = lum(front), b = lum(back)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  })
}

/** Opens a fresh draft and sends `fini` into the full house; resolves with the 429 response. */
async function sendIntoFullHouse(page, locale, text = 'fini') {
  await page.goto(page.__url)
  await page.locator('.adestia-chat').waitFor()
  await page.getByRole('button', { name: W[locale].newConversation, exact: true }).click()
  const refused = page.waitForResponse(isTurnPost)
  await page.locator('.adestia-composer__input').fill(text)
  await page.locator('.adestia-composer__send').click()
  return refused
}

// B-14 + B-16 · nominal: the refusal is explained under its message — four skins × en/fr × light/dark × desk/phone
for (const skin of ['alfred', 'nestor', 'dobby', 'skippy']) {
  for (const locale of ['en', 'fr']) {
    describe(`B-14/B-16: refused turn explained, ${skin}, ${locale}`, () => {
      let instance, browser
      before(async () => {
        instance = await startInstance('chat-saturated', skin, locale)
        browser = await chromium.launch()
      })
      after(async () => { await browser?.close(); await instance?.stop() })

      for (const [device, shape] of [['desk', DESK], ['phone', PHONE]]) {
        for (const scheme of ['light', 'dark']) {
          // panne attrapée : le 429 redevient muet (rien sous le message), ou la phrase n'est pas dans la langue de l'instance,
          // ou elle est illisible (contraste) ou coupée (hors de l'écran) sous cet habillage / ce thème / cette largeur
          test(`${device} ${scheme}: the limit is said in ${locale} under the refused message, readable`, async () => {
            const context = await browser.newContext({ ...shape, locale, colorScheme: scheme })
            const page = await context.newPage()
            page.__url = instance.url
            try {
              const response = await sendIntoFullHouse(page, locale)
              assert.equal(response.status(), 429)
              const line = page.locator('.adestia-chat').getByText(W[locale].refusal(1), { exact: true })
              await line.waitFor()
              assert.equal(await line.count(), 1)
              assert.equal(await page.locator('.adestia-bubble--user', { hasText: 'fini' }).count(), 1, 'the refused message stays in the thread')
              const box = await line.boundingBox()
              assert.ok(box && box.x >= 0 && box.x + box.width <= shape.viewport.width + 0.5, `the line is inside the screen: ${JSON.stringify(box)}`)
              assert.ok(await contrastRatio(line) >= 4.5, 'the line reads at AA contrast')
              await shot(page, `correctifs-429-${skin}-${locale}-${device}-${scheme}.png`)
            } finally { await context.close() }
          })
        }
      }
    })
  }
}

// B-14 · bords/exclusions: lifetime of the explanation, the limit is the server's, the user may send again at once
describe('B-14: the explanation outlasts the reread and goes with the next send or another conversation', () => {
  let instance, browser
  before(async () => {
    instance = await startInstance('chat-saturated', 'alfred', 'en')
    browser = await chromium.launch()
  })
  after(async () => { await browser?.close(); await instance?.stop() })
  const LINE = 'Turn limit reached (1 at a time) — try again in a moment.'

  // panne attrapée : la ligne disparaît à la relecture, ou un second envoi la double / la perd / vide le message
  test('it survives the reread, and a second send at once is refused the same way, one line, both messages kept', async () => {
    const context = await browser.newContext({ ...DESK, locale: 'en' })
    const page = await context.newPage()
    page.__url = instance.url
    try {
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      await page.getByRole('button', { name: 'New conversation', exact: true }).click()
      const first = page.waitForResponse(isTurnPost)
      await page.locator('.adestia-composer__input').fill('premier')
      const readAgain = page.waitForResponse(isConversationRead)
      await page.locator('.adestia-composer__send').click()
      assert.equal((await first).status(), 429)
      await readAgain
      const line = page.locator('.adestia-chat').getByText(LINE, { exact: true })
      await line.waitFor()
      assert.equal(await line.count(), 1)
      // free again at once
      const second = page.waitForResponse(isTurnPost)
      await page.locator('.adestia-composer__input').fill('second')
      await page.locator('.adestia-composer__send').click()
      assert.equal((await second).status(), 429)
      await page.locator('.adestia-bubble--user', { hasText: 'second' }).waitFor()
      await line.waitFor()
      assert.equal(await line.count(), 1, 'one explanation, not two')
      assert.equal(await page.locator('.adestia-bubble--user', { hasText: 'premier' }).count(), 1)
      assert.equal(await page.locator('.adestia-bubble--user', { hasText: 'second' }).count(), 1)
    } finally { await context.close() }
  })

  // panne attrapée : la ligne reste affichée dans une autre conversation, ou ne part pas à l'envoi suivant
  test('it goes when another conversation opens, and at the next send that is accepted', async () => {
    const context = await browser.newContext({ ...DESK, locale: 'en' })
    const page = await context.newPage()
    try {
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      await page.getByRole('button', { name: 'New conversation', exact: true }).click()
      const refused = page.waitForResponse(isTurnPost)
      await page.locator('.adestia-composer__input').fill('fini')
      await page.locator('.adestia-composer__send').click()
      await refused
      const line = page.locator('.adestia-chat').getByText(LINE, { exact: true })
      await line.waitFor()
      // open another conversation from the list: the line is not drawn there
      await page.getByRole('button', { name: /conversations/i }).first().click()
      await page.getByText('Seeded conversation 12', { exact: false }).first().click()
      await page.getByText('Seeded question 12.', { exact: false }).waitFor()
      assert.equal(await line.count(), 0, 'the other conversation does not show the refusal')
      // come back to the refused draft's tab: the explanation went with the move
      await page.getByRole('tab', { name: /fini/ }).click()
      await page.locator('.adestia-bubble--user', { hasText: 'fini' }).waitFor()
      assert.equal(await line.count(), 0, 'it does not come back once the user opened another conversation')
      // free the seat from its own conversation, then send: accepted, the reply is drawn
      await page.getByRole('button', { name: /conversations/i }).first().click()
      await page.getByText('Conversation en cours', { exact: false }).first().click()
      const stopped = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/turn/stop')
      await page.getByRole('button', { name: 'Stop', exact: true }).click()
      assert.equal((await stopped).status(), 200)
      await page.getByRole('tab', { name: /fini/ }).click()
      await page.locator('.adestia-bubble--user', { hasText: 'fini' }).waitFor()
      const accepted = page.waitForResponse(isTurnPost)
      await page.locator('.adestia-composer__input').fill('fini')
      await page.locator('.adestia-composer__send').click()
      assert.equal((await accepted).status(), 200)
      await page.getByText('Voici la liste des courses de la semaine.').waitFor()
      assert.equal(await line.count(), 0)
    } finally { await context.close() }
  })

  // exclusion : un refus qui n'est pas le plafond garde le texte du serveur, et ne reçoit pas la phrase du plafond
  test('another HTTP refusal keeps the server\'s own text, and says nothing about the turn limit', async () => {
    const context = await browser.newContext({ ...DESK, locale: 'en' })
    const page = await context.newPage()
    try {
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      await page.route('**/api/turn', (route) => route.request().method() === 'POST'
        ? route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"prompt rejected by the bench"}' })
        : route.continue())
      await page.getByRole('button', { name: 'New conversation', exact: true }).click()
      const refused = page.waitForResponse(isTurnPost)
      await page.locator('.adestia-composer__input').fill('fini')
      await page.locator('.adestia-composer__send').click()
      assert.equal((await refused).status(), 400)
      await page.locator('.adestia-chat').getByText('prompt rejected by the bench').waitFor()
      assert.equal(await page.locator('.adestia-chat').getByText('Turn limit reached', { exact: false }).count(), 0)
    } finally { await context.close() }
  })

  // échec : le serveur ne répond pas du tout → une ligne d'erreur sous le message envoyé, qui reste ; pas la phrase du plafond
  // (les mots exacts d'aujourd'hui ne sont pas dans le besoin : trou)
  test('no answer from the server leaves an error line under the sent message and keeps the message', async () => {
    const context = await browser.newContext({ ...DESK, locale: 'en' })
    const page = await context.newPage()
    try {
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      await page.route('**/api/turn', (route) => route.request().method() === 'POST' ? route.abort('connectionrefused') : route.continue())
      await page.getByRole('button', { name: 'New conversation', exact: true }).click()
      await page.locator('.adestia-composer__input').fill('fini')
      await page.locator('.adestia-composer__send').click()
      const alert = page.locator('.adestia-chat').getByRole('alert')
      await alert.first().waitFor()
      assert.notEqual((await alert.first().innerText()).trim(), '')
      assert.equal(await page.locator('.adestia-chat').getByText('Turn limit reached', { exact: false }).count(), 0)
      assert.equal(await page.locator('.adestia-bubble--user', { hasText: 'fini' }).count(), 1, 'the message stays in the thread')
      await shot(page, 'correctifs-no-answer.png')
    } finally { await context.close() }
  })
})

// B-14 · bords: the N of the sentence is the server's limit, not a constant
for (const locale of ['en', 'fr']) {
  describe(`B-14: the limit named is the server's, ${locale}`, () => {
    let instance, browser
    before(async () => {
      instance = await startInstance('chat-saturated-two', 'nestor', locale)
      browser = await chromium.launch()
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    // panne attrapée : le plafond est écrit en dur (« 1 ») ou lu ailleurs que dans la réponse du serveur
    test('with maxConcurrentTurns 2 the line says 2', async () => {
      const context = await browser.newContext({ ...DESK, locale })
      const page = await context.newPage()
      page.__url = instance.url
      try {
        const response = await sendIntoFullHouse(page, locale)
        assert.equal(response.status(), 429)
        await page.locator('.adestia-chat').getByText(W[locale].refusal(2), { exact: true }).waitFor()
      } finally { await context.close() }
    })
  })
}

// B-13 (`📎`) · the message just sent draws the paperclip icon and the names, not a text emoji
for (const locale of ['en', 'fr']) {
  describe(`B-13: a sent attachment, ${locale}`, () => {
    let instance, browser
    before(async () => {
      instance = await startInstance('chat-rail', 'alfred', locale)
      browser = await chromium.launch()
    })
    after(async () => { await browser?.close(); await instance?.stop() })
    const FILE = { name: 'menu-samedi.txt', mimeType: 'text/plain', buffer: Buffer.from('Soupe, puis tarte.') }

    // panne attrapée : l'envoi ajoute de nouveau « 📎 » au texte du message, ou n'affiche plus les noms de fichiers
    test('while its turn runs, the sent bubble names the file with a paperclip icon and carries no 📎 character', async () => {
      const context = await browser.newContext({ ...DESK, locale })
      const page = await context.newPage()
      try {
        await page.goto(instance.url)
        await page.locator('.adestia-chat').waitFor()
        await page.getByRole('button', { name: W[locale].newConversation, exact: true }).click()
        const uploaded = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/upload')
        await page.locator('input[type=file]').setInputFiles(FILE)
        assert.equal((await uploaded).status(), 200)
        await page.locator('.adestia-attachments__item', { hasText: FILE.name }).waitFor()
        await page.locator('.adestia-composer__input').fill('en cours')
        const turn = page.waitForResponse(isTurnPost)
        await page.locator('.adestia-composer__send').click()
        assert.equal((await turn).status(), 200)
        const bubble = page.locator('.adestia-bubble--user', { hasText: FILE.name })
        await bubble.waitFor()
        const said = await bubble.innerText()
        assert.ok(!said.includes('📎'), `no text emoji in the sent bubble: ${JSON.stringify(said)}`)
        assert.ok(said.includes('en cours'))
        assert.equal(await bubble.locator('svg use').first().getAttribute('href').then((h) => h?.split('#').pop()), 'adestia-i-paperclip')
        await shot(page, `correctifs-attach-${locale}.png`)
        // a reload reads the stored conversation: no emoji comes from its text
        await page.reload()
        await page.locator('.adestia-chat').waitFor()
        assert.ok(!(await page.locator('.adestia-chat').innerText()).includes('📎'))
      } finally { await context.close() }
    })

    // B-13 / B-16 (`upload failed`) · a refused upload is told in the instance's language, never as a raw browser message
    // panne attrapée : le repli reste une chaîne anglaise en dur, ou un message de navigateur fuit dans le plateau
    for (const [label, route, forbid] of [
      ['a 500 with a JSON body and no message', { status: 500, contentType: 'application/json', body: '{}' }, /request failed|upload failed/i],
      ['a 500 with an empty body', { status: 500, body: '' }, /JSON|Unexpected|Failed to execute/i],
    ]) {
      test(`${label}: the tray says it in ${locale}, with no English or browser wording left`, async () => {
        const context = await browser.newContext({ ...DESK, locale })
        const page = await context.newPage()
        try {
          await page.goto(instance.url)
          await page.locator('.adestia-chat').waitFor()
          await page.route('**/api/upload', (r) => r.fulfill(route))
          const refused = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/upload')
          await page.locator('input[type=file]').setInputFiles(FILE)
          await refused
          const alert = page.locator('.adestia-attachments').getByRole('alert')
          await alert.waitFor()
          const said = (await alert.innerText()).trim()
          assert.notEqual(said, '')
          if (locale === 'fr' || /JSON/.test(String(forbid))) assert.doesNotMatch(said, forbid, `the tray reads: ${said}`)
          assert.equal(await page.locator('.adestia-attachments__item').count(), 0, 'nothing is attached')
          await shot(page, `correctifs-upload-${locale}.png`)
        } finally { await context.close() }
      })
    }
  })
}

// B-13 (delegations) · E-13 is read-only: a signature in the transcript draws no card, the conversation still reads
describe('B-13: a delegated conversation carrying signatures reads as text, no card', () => {
  let instance, browser
  before(async () => {
    instance = await startInstance('chat-delegation-signatures', 'alfred', 'en')
    browser = await chromium.launch()
  })
  after(async () => { await browser?.close(); await instance?.stop() })

  // panne attrapée : la vue en lecture seule se met à dessiner des cartes de signature (ou la conversation ne s'ouvre plus)
  test('the transcript opens, its text is there, and no signature card nor Sign button is drawn', async () => {
    const context = await browser.newContext({ ...DESK, locale: 'en' })
    const page = await context.newPage()
    try {
      await page.goto(`${instance.url}/#/settings/delegations`)
      await page.getByText('Réserve la salle du conseil').first().click()
      await page.getByText('Une signature attend, une autre a expiré.').waitFor()
      const main = page.locator('body')
      assert.equal(await main.getByText('signatures.bench.invalid').count(), 0, 'no card names the signing origin')
      assert.equal(await main.getByText('A held action waits for your signature.').count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Sign', exact: true }).count(), 0)
      await shot(page, 'correctifs-delegation-signatures.png')
    } finally { await context.close() }
  })

  // contrôle : the same transcript in the chat of a user is still drawn as cards, so the absence above is a decision, not a broken seed
  test('control: the chat of the instance\'s own user still draws its signature cards', async () => {
    const context = await browser.newContext({ ...DESK, locale: 'en' })
    const page = await context.newPage()
    try {
      await page.goto(instance.url)
      await page.locator('.adestia-chat').waitFor()
      await page.getByRole('button', { name: /conversations/i }).first().click()
      await page.getByText('Fil riche').first().click()
      await page.getByText('A held action waits for your signature.').waitFor()
    } finally { await context.close() }
  })
})

// B-13 (composer) · a plugin or the home asks for the field: it gets the focus, the draft stays
for (const [device, shape] of [['desk', DESK], ['phone', PHONE]]) {
  describe(`B-13: the composer hands the field back when asked, ${device}`, () => {
    let instance, browser
    before(async () => {
      instance = await startInstance('base', 'alfred', 'en')
      browser = await chromium.launch()
    })
    after(async () => { await browser?.close(); await instance?.stop() })

    // panne attrapée : la demande de focus n'atteint plus le champ du composeur, ou elle efface/remplace le brouillon
    test('the home\'s ask bar puts the cursor in the chat field and keeps the draft', async () => {
      const context = await browser.newContext({ ...shape, locale: 'en' })
      const page = await context.newPage()
      try {
        await page.goto(instance.url)
        await page.locator('.adestia-chat').waitFor()
        const field = page.locator('.adestia-chat .adestia-composer__input')
        if (device === 'phone') await page.getByRole('button', { name: /Open apps/i }).first().click()
        const ask = page.getByText('Write to Alfred… or “open my projects”', { exact: true }).first()
        await ask.waitFor()
        if (device === 'desk') {
          await field.fill('brouillon à garder')
          await page.locator('body').click({ position: { x: 900, y: 120 } })
        }
        await ask.click()
        await page.waitForFunction(() => document.activeElement?.matches?.('.adestia-chat .adestia-composer__input') ?? false, null, { timeout: 5000 })
        if (device === 'desk') assert.equal(await field.inputValue(), 'brouillon à garder')
        await shot(page, `correctifs-focus-${device}.png`)
      } finally { await context.close() }
    })
  })
}

// B-13 (CSS leftovers) · none of the three classes stays without a rule; the suite's own grep no longer finds them as live names
describe('B-13: the three CSS leftovers of the chat', () => {
  const walk = async (dir, out = []) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') await walk(path, out) } else out.push(path)
    }
    return out
  }
  for (const name of ['adestia-composer--busy', 'adestia-sheet__close', 'adestia-sheet__origin']) {
    // panne attrapée : une classe posée dans le code du chat sans aucune règle CSS qui la style
    test(`${name} is either absent from the sources or has a style rule`, async () => {
      const files = await walk(join(root, 'packages/web/src'))
      const code = []
      const css = []
      for (const file of files) {
        const text = await readFile(file, 'utf8')
        if (!text.includes(name)) continue
        if (file.endsWith('.css')) css.push(file)
        else if (/\.(tsx?|jsx?)$/.test(file)) code.push(file)
      }
      if (code.length) assert.ok(css.length > 0, `${name} is used in ${code.join(', ')} with no rule in any .css`)
      else assert.equal(css.length, 0, `${name} is unused but still styled in ${css.join(', ')}`)
    })
  }
})

// B-15 · the changed behaviours are in the CHANGELOG
describe('B-15: the CHANGELOG says what changed in the chat', () => {
  test('the unreleased section names the race of the chat, the refused turn and the sent attachment', async () => {
    const text = await readFile(join(root, 'CHANGELOG.md'), 'utf8')
    const at = text.indexOf('## adestia-correctifs (unreleased)')
    assert.ok(at >= 0, 'an « adestia-correctifs (unreleased) » section exists')
    const section = text.slice(at, text.indexOf('\n## ', at + 5) < 0 ? undefined : text.indexOf('\n## ', at + 5))
    assert.match(section, /c549a5d/, 'the chat race (c549a5d) is written')
    assert.match(section, /429|concurrency limit|refus/i, 'the refused turn is written')
    assert.match(section, /paperclip/, 'the sent attachment is written')
  })
})
