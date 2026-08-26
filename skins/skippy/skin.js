/**
 * Skippy — the code agent's HUD, ported from the predecessor's livery.
 *
 * Not the butler's home repainted: another SCREEN, because the two bodies do
 * not answer the same question. The butler opens onto a life (tasks, domains,
 * a curated brief); this one opens onto a bridge — the core, the prompt, and
 * whatever modules this instance arms.
 *
 * The slots receive a host element and a small context; navigation from here
 * is plain hash links (every tiled plugin answers on `#/<id>`).
 */

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

/**
 * The core — a clock: 36 graduations, two counter-rotating rings, a pulsing
 * heart. One component, two jobs: 150px on the bridge where it drifts, 40px
 * in the thread where it spins 4.5× faster. That second job is what gives it
 * a reason to exist beyond décor: hurried, it SAYS something.
 */
function core(px, speed) {
  const sp = speed || 1
  const c = document.createElement('canvas')
  const dpr = Math.min(devicePixelRatio || 1, 2)
  c.width = c.height = px * dpr
  c.style.width = c.style.height = `${px}px`
  c.setAttribute('aria-hidden', 'true')
  const k = c.getContext('2d')
  const S = c.width
  const C = S / 2
  const u = S / 360
  const arc = (r, from, to, w, col) => {
    k.beginPath()
    k.arc(C, C, r * u, from, to)
    k.strokeStyle = col
    k.lineWidth = w * u
    k.lineCap = 'round'
    k.stroke()
  }
  const paint = (raw) => {
    const t = raw * sp
    k.clearRect(0, 0, S, S)
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      const big = i % 6 === 0
      k.beginPath()
      k.moveTo(C + Math.cos(a) * 168 * u, C + Math.sin(a) * 168 * u)
      k.lineTo(C + Math.cos(a) * (big ? 150 : 158) * u, C + Math.sin(a) * (big ? 150 : 158) * u)
      k.strokeStyle = big ? 'rgba(184,120,30,.8)' : 'rgba(92,101,112,.55)'
      k.lineWidth = (big ? 2.5 : 1.5) * u
      k.stroke()
    }
    arc(128, 0, Math.PI * 2, 2, 'rgba(36,43,52,.95)')
    arc(128, t * 0.0019, t * 0.0019 + 1.5, 4, 'rgba(242,169,59,.9)')
    arc(96, -t * 0.0013, -t * 0.0013 + 2.4, 3.5, 'rgba(215,222,230,.34)')
    const p = 0.5 + 0.5 * Math.sin(t * 0.004)
    k.beginPath()
    k.arc(C, C, (24 + p * 10) * u, 0, 6.284)
    k.fillStyle = `rgba(242,169,59,${0.18 + p * 0.22})`
    k.fill()
    k.beginPath()
    k.arc(C, C, 13 * u, 0, 6.284)
    k.fillStyle = `rgba(255,214,140,${0.85 + p * 0.15})`
    k.fill()
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) paint(900)
  // The loop stops by itself when the node leaves the DOM: without that, an
  // orphaned requestAnimationFrame would spin until the page reloads.
  else (function spin(t) { if (t && !c.isConnected) return; paint(t); requestAnimationFrame(spin) })(0)
  return c
}

/**
 * The bridge — this body's landing.
 *
 * Its own row for the shell's own screen: a livery that replaces the landing
 * replaces the Settings tile that stands on it, and the gear alone is not a
 * landing. Not filed under "Modules" — Réglages is not a plugin, and a HUD
 * that says otherwise is a HUD that lies about what is armed.
 */
function home(host, context) {
  const h = new Date().getHours()
  const salut = h < 5 || h >= 22 ? 'Encore debout' : h < 18 ? 'Encore toi' : 'Toujours là'
  const date = new Date()
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  host.innerHTML = `<div class="hud">
    <section class="panel brackets bridge">
      <div class="ruler"></div>
      <div class="bridgebody">
        <div class="corewrap"></div>
        <div class="hailwrap">
          <h1 class="hail">${esc(salut)}, <em>petit singe</em>.</h1>
          <p class="hailsub" data-sub>${esc(date)}</p>
          <button class="promptbox" data-prompt type="button"><span class="caret" aria-hidden="true"></span><span>Ordonner quelque chose au Magnifique…</span><kbd>⌘K</kbd></button>
        </div>
      </div>
    </section>
    <div class="hudrow">Modules</div>
    <div class="hudmosaic" data-tiles><div class="hudempty">Interrogation du noyau…</div></div>
    <div class="hudrow">Système</div>
    <div class="hudmosaic">
      <a class="hudtile" href="#/settings">
        <span class="hudico">[ SYS ]</span>
        <span class="hudnm">Réglages</span>
        <span class="hudst">Jeton, serveurs MCP, aspect, instructions</span>
      </a>
    </div>
  </div>`

  host.querySelector('.corewrap').appendChild(core(150, 1))
  // The prompt only hands the cursor back to the composer: the chat stays the
  // surface, the bridge is just a way in.
  host.querySelector('[data-prompt]').addEventListener('click', () => context.focusComposer())

  // The armed modules, as HUD tiles. Plain hash links: every tiled plugin
  // answers on #/<id>, which is the whole navigation API a livery needs.
  void fetch('/api/instance')
    .then((r) => (r.ok ? r.json() : undefined))
    .then((info) => {
      const mount = host.querySelector('[data-tiles]')
      if (!mount) return
      const tiles = (info?.plugins ?? [])
        .filter((plugin) => plugin.tile)
        .map(
          (plugin) => `<a class="hudtile" href="#/${esc(plugin.id)}">
            <span class="hudico">[ ${esc(plugin.id.toUpperCase())} ]</span>
            <span class="hudnm">${esc(plugin.tile.label)}</span>
            <span class="hudst">${esc(plugin.description ?? '')}</span>
          </a>`,
        )
      mount.innerHTML = tiles.join('') || '<div class="hudempty">Aucun module activé sur ce corps.</div>'
      const sub = host.querySelector('[data-sub]')
      if (sub && tiles.length) sub.textContent = `${date} · ${tiles.length} MODULE${tiles.length > 1 ? 'S' : ''} EN LIGNE`
    })
    .catch(() => {
      const mount = host.querySelector('[data-tiles]')
      if (mount) mount.innerHTML = '<div class="hudempty">Noyau injoignable.</div>'
    })
}

/** The status band above the breadcrumb. */
function consoleBand(host, context) {
  const info = context.instance
  const cell = (label, strong) =>
    `<span class="cst">${esc(label)}${strong ? `<b>${esc(strong)}</b>` : ''}</span>`
  host.innerHTML = `<div class="console">
    <span class="cmark"><i class="led"></i>SKIPPY</span>
    ${cell('moteur ', info ? `${info.driver.label} ${info.driver.cliVersion}` : '?')}
    ${cell('modules ', String(info?.plugins.length ?? 0))}
    <span class="cgrow"></span>
    ${cell('tours ', info ? `${info.turns.running}/${info.turns.max}` : '—')}
  </div>`
}

export default function skippy() {
  return {
    brand: 'SKIPPY',
    title: 'Skippy',
    placeholder: 'Ordonner quelque chose au Magnifique…',
    idleLabel: 'Le Magnifique est au repos',
    busyLabel: 'Le Magnifique opère',
    greetingDay: 'Encore toi, petit singe.',
    greetingEvening: 'Toujours là, petit singe.',
    greetingAside: 'Qu’est-ce qu’on casse ?',
    // The header crest: same silhouette as the favicon, in currentColor — it
    // has to hold in monochrome, so the stroke carries it, not the amber.
    crest:
      '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round">' +
      '<circle cx="50" cy="50" r="31" stroke-width="9" stroke-dasharray="120 75" transform="rotate(-40 50 50)"/>' +
      '<circle cx="50" cy="50" r="10" fill="currentColor" stroke="none"/>' +
      '<path d="M50 8 v9 M50 83 v9 M8 50 h9 M83 50 h9" stroke-width="8"/></svg>',
    home,
    busy: (host) => {
      host.appendChild(core(40, 4.5))
    },
    console: consoleBand,
  }
}
