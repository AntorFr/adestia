/**
 * La carte montée sous les deux langues, avec une géolocalisation fausse.
 *
 * Deux pannes que seul un DOM montre : de l'anglais qui reste français (une
 * chaîne oubliée hors de la table), et un français qui a bougé d'une lettre
 * pendant le passage par la table. Le HUD, lui, doit porter une sortie NOMMÉE.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

const enc = (n) => {
  let v = n < 0 ? ~(n << 1) : n << 1
  let s = ''
  while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5 }
  return s + String.fromCharCode(v + 63)
}
const poly = (pts, f, dims) => {
  const last = new Array(dims).fill(0)
  return pts.map((p) => p.map((x, d) => {
    const q = Math.round(x * f); const r = enc(q - last[d]); last[d] = q; return r
  }).join('')).join('')
}

const PTS = [[48.0, 2.0], [48.002, 2.002], [48.004, 2.004], [48.006, 2.006]]
const DATA = (reperes) => ({
  titre: 'Val',
  reperes,
  trace: {
    geometrie: poly(PTS, 1e5, 2),
    altitudes: poly([[100], [120], [90], [140]], 1, 1),
    distance_m: 1200, denivele_pos_m: 60, duree_s: 1200, escaliers_m: 30,
    calcule_le: '2026-01-02', moteur: 'osrm',
  },
})
const REPERES = [
  { nom: 'Pont', latlng: '48.0,2.0', distance_precedent_m: 500, ecart_trace_m: 80 },
  { nom: '', latlng: '48.003,2.003' },
  { nom: 'Fin', latlng: '48.006,2.006' },
]

async function boot() {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM('<!doctype html><body><div id="h"></div></body>', { url: 'https://i.test/' })
  global.window = dom.window
  global.document = dom.window.document
  global.Image = dom.window.Image
  global.requestAnimationFrame ??= (f) => setTimeout(f, 0)
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
  return dom
}

async function monte(dom, locale, data, { geo = 'ok', vue = 'carte' } = {}) {
  const calls = { clear: 0 }
  const nav = dom.window.navigator
  if (geo === 'none') delete nav.geolocation
  else {
    Object.defineProperty(nav, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (ok, ko) => {
          if (geo === 'ok') ok({ coords: { latitude: 48.003, longitude: 2.003, accuracy: 5 } })
          else if (geo === 'far') ok({ coords: { latitude: 49, longitude: 3, accuracy: 5 } })
          else ko({ code: geo === 'denied' ? 1 : 2, PERMISSION_DENIED: 1 })
          return 7
        },
        clearWatch: () => { calls.clear += 1 },
      },
    })
  }
  global.fetch = async () => ({ ok: true, json: async () => data })
  const { mountParcours } = await import('../web/carte.js')
  const hote = globalThis.document.createElement('div')
  globalThis.document.body.appendChild(hote)
  const off = mountParcours(hote, {
    src: '/x', chemin: 'a/v.parcours.json', locale, vue,
    urls: { gpx: (p) => `/gpx?f=${p}`, page: (p) => `#/parcours/${p}` },
  })
  for (let i = 0; i < 50 && !hote.querySelector('.pc-ready, .pc-vide'); i += 1) {
    await new Promise((r) => setTimeout(r, 5))
  }
  return { hote, off, calls }
}

const textes = (root) => {
  const out = []
  const w = globalThis.document.createTreeWalker(root, 4)
  for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n.textContent)
  root.querySelectorAll('[title],[aria-label]').forEach((e) => {
    out.push(e.getAttribute('title') ?? '', e.getAttribute('aria-label') ?? '')
  })
  return out.join('\n')
}
const ACCENT = /[éèêàùçôîœÉ]/

test('en anglais, rien d’accentué hors du contenu semé — carte, HUD, repères sans nom', async () => {
  const dom = await boot()
  for (const geo of ['ok', 'far', 'denied', 'gone', 'none']) {
    const { hote, off } = await monte(dom, 'en', DATA(REPERES), { geo })
    hote.querySelectorAll("button.pc-fond")[1].click()
    const dit = textes(hote)
    assert.ok(!ACCENT.test(dit.replace(/Pont|Val/g, '')), `${geo}: ${dit.match(ACCENT.source && /.*[éèêàùçôîœ].*/)}`)
    off()
  }
})

test('en français, le texte d’avant la tâche, à la lettre', async () => {
  const dom = await boot()
  const { hote } = await monte(dom, 'fr', DATA(REPERES))
  const dit = textes(hote)
  for (const s of [
    '3 repères', '20 min de marche', '30 m d\'escaliers', 'Départ — Pont', 'Repère 2 —', 'Arrivée — Fin',
    'Zoomer', 'Dézoomer', 'Recadrer sur le parcours', 'Changer de fond de carte', '🥾 Mode balade',
    'Plein écran, votre position, ce qui reste à marcher', '↓ Télécharger le GPX',
    'La trace, pour Organic Maps, OsmAnd…', '500 m depuis le précédent', '⚠ à 80 m de la trace',
    'Trace calculée le 2026-01-02 — osrm.', '© IGN — Géoplateforme',
  ]) assert.ok(dit.includes(s), `manque « ${s} »\n${dit}`)
  assert.ok(/Profil altimétrique sur .* mètres, 3 repères\./.test(dit))
})

test('le HUD : une sortie nommée dans chaque langue, qui ferme le mode et rend le focus', async () => {
  const dom = await boot()
  for (const [locale, nom, suivi] of [['en', 'Leave walking mode', '🧭 Follow'], ['fr', 'Quitter le mode balade', '🧭 Suivi']]) {
    const { hote, calls } = await monte(dom, locale, DATA(REPERES))
    const ouvre = [...hote.querySelectorAll('button.pc-fond')].find((b) => /^🥾/.test(b.textContent))
    ouvre.focus(); ouvre.click()
    const hud = hote.querySelector('.pc-hud')
    assert.ok(hud, 'HUD absent')
    assert.ok(hud.textContent.includes(suivi))
    const sortie = [...hud.querySelectorAll('button')].find((b) => b.textContent.trim() === nom)
    assert.ok(sortie, `sortie « ${nom} » absente : ${hud.textContent}`)
    assert.equal(sortie.title, nom)
    assert.ok(sortie.querySelector('use')?.getAttribute('href') === '#adestia-i-x')
    assert.ok(!hud.textContent.includes('✕'))
    sortie.click()
    assert.equal(hote.querySelector('.pc-hud'), null)
    assert.ok(!hote.classList.contains('pc-balade'))
    assert.equal(calls.clear, 1)
    // fermer deux fois n'efface pas deux fois
    ouvre.click(); ouvre.click()
    assert.equal(hote.querySelector('.pc-hud'), null)
    assert.equal(calls.clear, 2)
  }
})

test('les états du GPS, dits dans la langue', async () => {
  const dom = await boot()
  const att = {
    ok: ['3 sur 1.2 km', '1 of 1.2'], far: ['À ', ' m from the route'],
    denied: ['Position refusée — autorisez-la dans le navigateur.', 'Position denied — allow it in your browser.'],
    gone: ['Position indisponible pour l’instant.', 'Position unavailable for now.'],
    none: ['Ce navigateur ne donne pas la position.', 'This browser cannot provide your position.'],
  }
  for (const geo of ['denied', 'gone', 'none']) {
    for (const [i, locale] of ['fr', 'en'].entries()) {
      const { hote } = await monte(dom, locale, DATA(REPERES), { geo })
      ;[...hote.querySelectorAll('button.pc-fond')].find((b) => /^🥾/.test(b.textContent)).click()
      assert.ok(hote.querySelector('.pc-hud-1').textContent === att[geo][i], hote.querySelector('.pc-hud-1').textContent)
    }
  }
  const { hote } = await monte(dom, 'fr', DATA(REPERES), { geo: 'far' })
  ;[...hote.querySelectorAll('button.pc-fond')].find((b) => /^🥾/.test(b.textContent)).click()
  assert.match(hote.querySelector('.pc-hud-1').textContent, /^À \d+ m du parcours$/)
  assert.equal(hote.querySelector('.pc-hud-2').textContent, 'Hors trace — l’avancement ne veut rien dire ici.')
})

test('zéro et un repère : le singulier, et la carte sans trace', async () => {
  const dom = await boot()
  const un = { titre: 'X', reperes: [{ nom: 'Seul', latlng: '48,2' }], trace: {} }
  for (const [locale, mot] of [['en', '1 waypoint'], ['fr', '1 repère']]) {
    const { hote } = await monte(dom, locale, un)
    assert.ok(hote.querySelector('.pc-stats').textContent === mot, hote.querySelector('.pc-stats').textContent)
  }
  const zero = { titre: 'X', reperes: [], trace: {} }
  const en = await monte(dom, 'en', zero)
  assert.equal(en.hote.querySelector('.pc-vide').textContent, 'No points to display.')
  const fr = await monte(dom, 'fr', zero)
  assert.equal(fr.hote.querySelector('.pc-vide').textContent, 'Aucun point à afficher.')
  assert.equal(fr.hote.querySelector('.pc-stats').textContent, '0 repère')
})

test('la vue lien et l’erreur de lecture, dans la langue', async () => {
  const dom = await boot()
  const nu = { reperes: [] }
  assert.equal((await monte(dom, 'en', nu, { vue: 'lien' })).hote.querySelector('.pc-card-m').textContent, 'route not calculated yet')
  const f = await monte(dom, 'fr', nu, { vue: 'lien' })
  assert.equal(f.hote.querySelector('.pc-card-m').textContent, 'trace pas encore calculée')
  assert.equal(f.hote.querySelector('.pc-card-t').textContent, 'Parcours')
  const e = await monte(dom, 'en', DATA(REPERES), { vue: 'lien' })
  assert.match(e.hote.querySelector('.pc-card-m').textContent, /3 waypoints/)
  global.fetch = async () => ({ ok: false, status: 404 })
  const { mountParcours } = await import('../web/carte.js')
  for (const [locale, msg] of [['en', 'Unreadable route: HTTP 404'], ['fr', 'Parcours illisible : HTTP 404']]) {
    const hote = globalThis.document.createElement('div')
    mountParcours(hote, { src: '/x', locale })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(hote.textContent, msg)
  }
})

test('un nom de repère qui ressemble à un espace réservé reste tel quel', async () => {
  const dom = await boot()
  const { hote } = await monte(dom, 'en', DATA([{ nom: '%n %distance', latlng: '48,2' }]))
  assert.ok(textes(hote).includes('%n %distance'))
})
