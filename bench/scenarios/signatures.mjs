/**
 * A tool call held at the façade, signed without leaving the chat.
 *
 * The façade is faked FROM THE BROWSER: every request to its origin is
 * answered with a stand-in ceremony that speaks Tessera's beacons. What is
 * real is everything Adestia draws — the card under the message that asked,
 * the sheet, the frame, and what happens when the frame says "signed".
 */
import { appendFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const FACADE = 'https://tessera.example'

// Tessera's beacons, the real shape: stage names only.
const CEREMONY = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<style>body{font:15px system-ui;margin:0;padding:20px;background:#fff;color:#1f2733}
.card{border:1px solid #c9d0dc;border-radius:10px;padding:14px;margin:12px 0}
.k{font-size:12px;text-transform:uppercase;color:#5a6577}
button{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid #2b59c3;margin-right:8px}
.p{background:#2b59c3;color:#fff}</style>
<h2>Tessera — approbation</h2>
<div class="card"><div class="k">Ce qui est demandé</div>
<p><b>Envoyer un e-mail à Paul</b></p><p>Objet : « Planning du week-end »</p></div>
<button class="p" id="ok">Approuver avec la passkey</button><button id="no">Refuser</button>
<script>
function report(s){parent.postMessage({source:"tessera-ceremony",stage:s,code:null},"*")}
report("loaded");
document.getElementById("ok").onclick=function(){report("challenge_ok");report("assertion_ok");
  document.body.innerHTML="<h2>Approuvé ✓</h2>"};
document.getElementById("no").onclick=function(){report("denied")};
</script>`

async function fakeFacade(page) {
  await page.context().route(`${FACADE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: CEREMONY }),
  )
}

export default async function scenario(bench) {
  // Created through the API first: the store writes its own directory.
  const live = await bench.api('/api/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Mail à Paul' }),
  })
  const threads = await bench.threadsDir()

  // A thread from earlier in the day, read back from the store: one grant
  // still waiting, one consent that lapsed.
  const stored = 'c3c3c3c3-0000-4000-8000-000000000003'
  await writeFile(
    join(threads, `${stored}.jsonl`),
    [
      { type: 'meta', id: stored, title: 'Briefing du matin', updatedAt: '2026-09-30T07:00:00.000Z' },
      { type: 'message', id: 'u1', role: 'user', text: 'Prépare le briefing de demain 6h30 avec mes mails.', at: '2026-09-30T07:00:00.000Z' },
      {
        type: 'message',
        id: 'a1',
        role: 'agent',
        text: "J'ai demandé une autorisation à l'avance pour lire tes mails demain matin : signe-la quand tu veux aujourd'hui.",
        at: '2026-09-30T07:00:05.000Z',
        tools: [{ name: 'mcp__google__request_grant', ok: true }],
        signatures: [
          { id: 'g_91', kind: 'grant', url: `${FACADE}/consent/g_91`, expiresAt: '2999-10-01T06:00:00Z' },
          { id: 'c_old', kind: 'consent', url: `${FACADE}/consent/c_old`, expiresAt: '2026-01-01T07:10:00Z' },
        ],
      },
    ]
      .map(bench.line)
      .join(''),
  )

  // ── The live half: a mail held at the façade ─────────────────────────────
  await appendFile(
    join(threads, `${live.id}.jsonl`),
    bench.line({ type: 'message', id: 'u1', role: 'user', text: 'Envoie le planning du week-end à Paul.', at: '2026-09-30T09:00:00.000Z' }),
  )

  const page = await bench.open({ tab: live.id })
  await fakeFacade(page)
  await bench.attached()
  bench.emit({ type: 'tool-use', name: 'mcp__google__send_mail', target: 'google', id: 't1' })
  bench.emit({ type: 'tool-result', name: 'mcp__google__send_mail', ok: true, id: 't1' })
  bench.emit({
    type: 'signature-request',
    id: 'c_7f3a',
    kind: 'consent',
    url: `${FACADE}/consent/c_7f3a`,
    expiresAt: '2999-01-01T09:10:00Z',
  })
  bench.emit({ type: 'text-delta', text: "L'envoi attend ta signature — je le reprends dès qu'elle est donnée." })
  await page.waitForTimeout(700)
  await bench.shoot(page, '1-card-in-the-live-turn')

  await page.getByRole('button', { name: 'Signer' }).click()
  await page.frameLocator('iframe').getByText('Approuver avec la passkey').waitFor()
  await bench.shoot(page, '2-sheet-desktop')

  await page.frameLocator('iframe').getByText('Approuver avec la passkey').click()
  await page.waitForTimeout(1800)
  await bench.shoot(page, '3-signed-and-relaunched')

  // ── Read back from the store, both themes and a phone ────────────────────
  for (const theme of ['light', 'dark']) {
    const reloaded = await bench.open({ theme, tab: stored })
    await fakeFacade(reloaded)
    await reloaded.waitForTimeout(500)
    await bench.shoot(reloaded, `4-from-the-store-${theme}`)
  }
  const phone = await bench.open({ tab: stored, width: 390, height: 844, touch: true })
  await fakeFacade(phone)
  await phone.waitForTimeout(500)
  await bench.shoot(phone, '5-phone-card')
  await phone.getByRole('button', { name: 'Signer' }).first().click()
  await phone.frameLocator('iframe').getByText('Approuver avec la passkey').waitFor()
  await bench.shoot(phone, '6-phone-sheet')
}
