/**
 * The Voyages engine — a per-day timeline and a tray of suggestions.
 *
 * Carried over from the predecessor, the same way the workbench was: this is a
 * thousand lines of debugged domain rendering, and rewriting it in React would
 * have meant re-earning every one of its behaviours — the fractional drop rank,
 * the leg escalation, the reverse drag back to the tray.
 *
 * What CHANGED is only the coupling. The original read module-scope globals
 * from a shell that knew this plugin by name (`page`, `memInfo`, `memIndex`)
 * and called `/api/voyage/...` by hand. Everything it needs is now handed to it
 * by its host, so the plugin knows nothing about where it is mounted and the
 * shell knows nothing about trips.
 *
 * Its own WORDS come with it, in both languages the shell speaks. That is the
 * i18n contract: the shell translates the shell, a plugin ships its own
 * sentences, and it is told which language to speak.
 */

/** This plugin's vocabulary. Keyed by the English sentence, like the shell's. */
const FR = {
  Home: 'Accueil',
  Trips: 'Voyages',
  'loading…': 'chargement…',
  'Trips are unavailable.': 'Voyages indisponibles.',
  'One folder per trip — bookings, suggestions, a timeline to compose.':
    'Un dossier par voyage — résas, suggestions, timeline à composer.',
  'No trip yet — ask the agent to frame one.':
    'Aucun voyage — demandez à l’agent d’en cadrer un (« on part en Corse du 8 au 22 août »).',
  'no dates — an idea to frame': 'sans dates — envie à cadrer',
  confirmed: 'confirmée',
  'confirmed item': 'confirmé',
  Archive: 'Archive',
  'trips closed': 'voyages clos',
  'Unreadable trip': 'Voyage illisible',
  Trip: 'Voyage',
  Status: 'Statut',
  Dates: 'Dates',
  Modes: 'Modes',
  'An idea for now — the tray is live, the timeline waits for dates.':
    'Voyage à l’état d’idée — le tray vit, la timeline attend les dates.',
  'Set the dates to compose':
    'Posez les dates pour composer',
  '— tell the agent. Without a start and an end, nothing can be confirmed.':
    '— dites-le à l’agent. Sans début ni fin, la confirmation est impossible.',
  Suggestions: 'Suggestions',
  '— from the agent, in the meantime': '— par l’agent, en attendant',
  'Nothing to sort — ask the agent for suggestions.':
    'Rien à trier — demandez des suggestions à l’agent.',
  'No suggestion — ask the agent for some.': 'Aucune suggestion — demandez-en à l’agent.',
  days: 'jours',
  'legs and weather derived as it draws': 'liaisons et météo dérivées au rendu',
  '— free day — drop a card here': '— journée libre — déposez une carte',
  'arrival · night here': 'arrivée · nuit ici',
  'night here': 'nuit ici',
  All: 'Tous',
  'A card on a day = confirmed · a card from the plan back here = returned to suggestions':
    'Une carte sur un jour = confirmée · une carte du planning ici = rendue aux suggestions',
  dismissed: 'écartée',
  'Dismiss — kept, never suggested again': 'Écarter — conservée, jamais reproposée',
  'Take back into the suggestions': 'Reprendre dans les suggestions',
  'The pages of this trip': 'Les fiches de ce voyage',
  '— what the folder holds': '— ce que le dossier contient',
  'Click: page · Drag: move': 'Clic : fiche · Glisser : déplacer',
  'Click: page · Drag: confirm': 'Clic : fiche · Glisser : confirmer',
  'to be placed on the timeline': 'à placer sur la timeline',
  suggestion: 'suggestion',
  'the agent’s note': 'la fiche de l’agent',
  Hour: 'Heure',
  Set: 'Poser',
  Clear: 'Effacer',
  'optional — the order of the cards makes the day, the hour annotates it':
    'optionnelle — l’ordre des cartes fait le déroulé, l’heure l’annote',
  'See the page': 'Voir la fiche',
  'Open the site': 'Ouvrir la page',
  'Return to suggestions': 'Rendre aux suggestions',
  Dismiss: 'Écarter',
  Close: 'Fermer',
  'drag the card onto a day to confirm': 'glissez la carte sur un jour pour confirmer',
  'Booking found in the mailbox — the thread stays the source of truth.':
    'Résa retrouvée dans la boîte mail — la vérité du fil y reste.',
  'Maps entry — rating, hours, directions.':
    'Fiche maps — note, horaires, itinéraire.',
  'Gesture refused': 'Geste refusé',
  'Gesture impossible': 'Geste impossible',
  'weather at D-10': 'météo à J-10',
  'outside the reliable window (D+10) — the icon appears as departure nears':
    'hors fenêtre fiable (J+10) — le picto apparaît à l’approche du départ',
  'from the hotel · ': 'de l’hôtel · ',
  page: 'fiche',
  route: 'parcours',
  'this instance has no app to open a route': 'aucune app pour ouvrir un parcours ici',
  hebergement: 'hébergement',
  resto: 'resto',
  activite: 'activité',
  visite: 'visite',
  trajet: 'trajet',
  card: 'carte',
  min: 'min',
}

export default function createVoyagesApp(api) {
  const { page, esc, crumbs, call, shellFetch, tone, finished, openPage, locale } = api
  const t = (key) => (locale === 'fr' ? (FR[key] ?? key) : key)

  const VTYPE = {
    hebergement: { ico: '🏠', c: '--v-maison', n: 'hebergement' },
    resto: { ico: '🍽️', c: '--v-cuisine', n: 'resto' },
    activite: { ico: '🚣', c: '--v-diy', n: 'activite' },
    visite: { ico: '🏛️', c: '--v-agenda', n: 'visite' },
    trajet: { ico: '🧭', c: '--v-proj', n: 'trajet' },
  }
  const vtypeOf = (type) => VTYPE[type] || { ico: '◆', c: '--v-voyage', n: type || 'card' }
  const vtypeName = (type) => t(vtypeOf(type).n)
  // The `type` CLASSES a card (colour, tray facets); the glyph is display only,
  // and the agent may set one per card (`ico`) — a market is not a rowing boat.
  // It comes from a file and goes into innerHTML, so it is escaped here once
  // for every render.
  const vicoOf = (item) => esc(item.ico || '') || vtypeOf(item.type).ico

  const CRX = { matin: 0, midi: 1, 'apres-midi': 2, soir: 3 }
  const CRN = { matin: 'matin', midi: 'midi', 'apres-midi': 'après-midi', soir: 'soir' }
  // The order of the cards IS the shape of the day: an explicit rank set by the
  // drop, falling back to the old slot for items nobody ever moved.
  const vrank = (i) => (typeof i.ordre === 'number' ? i.ordre : ((CRX[i.creneau] ?? 2) + 1) * 1000)
  const VMODE_API = { marche: 'WALK', voiture: 'DRIVE', velo: 'BICYCLE', transport: 'TRANSIT' }
  const VMODE_ICO = { marche: '🚶', voiture: '🚗', velo: '🚲', transport: '🚇' }
  // Google Weather `type` → glyph (main families; cloud by default).
  const WX_ICO = { CLEAR: '☀️', MOSTLY_CLEAR: '🌤️', PARTLY_CLOUDY: '⛅', MOSTLY_CLOUDY: '🌥️', CLOUDY: '☁️', WINDY: '💨', FOG: '🌫️', HAZE: '🌫️', THUNDERSTORM: '⛈️', THUNDERSHOWER: '⛈️', SCATTERED_THUNDERSTORMS: '⛈️', SNOW: '🌨️' }
  const wxIco = (type) =>
    WX_ICO[type] ||
    (/RAIN|SHOWER/.test(type || '') ? '🌧️' : /THUNDER/.test(type || '') ? '⛈️' : /SNOW/.test(type || '') ? '🌨️' : '☁️')

  const vfmtDay = (iso) =>
    new Date(iso + 'T12:00:00').toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  function vdaysOf(a, b) {
    const out = []
    const end = new Date(b + 'T12:00:00')
    for (let d = new Date(a + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().slice(0, 10))
    }
    return out
  }
  const vkmOf = (a, b) => {
    const r = Math.PI / 180
    const h =
      Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
    return 12742 * Math.asin(Math.sqrt(h))
  }
  const vmin = (s) => {
    const m = Math.round(s / 60)
    return m >= 60 ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : m + ' ' + t('min')
  }

  let voy = null // { path, data, state, filter, showEc, fiches }
  let vdrag = false
  let vdragId = null // the card being dragged (dataTransfer is unreadable in dragover)

  // Where a card will land in a day: the index it falls before, from the
  // cursor's vertical position against the cards already there.
  function vdropIndex(dz, y, skipId) {
    const els = [...dz.querySelectorAll('.vcard')].filter((c) => c.dataset.vi !== skipId)
    let idx = els.length
    for (let k = 0; k < els.length; k++) {
      const r = els[k].getBoundingClientRect()
      if (y < r.top + r.height / 2) {
        idx = k
        break
      }
    }
    return { idx, els }
  }
  function vclearIns() {
    page.querySelectorAll('.inst,.insb').forEach((x) => x.classList.remove('inst', 'insb'))
  }

  const vRouteCache = new Map()
  async function vroute(a, b, mode) {
    const key = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}|${mode}`
    if (vRouteCache.has(key)) return vRouteCache.get(key)
    try {
      const r = await call(`/route?frm=${a.lat},${a.lng}&to=${b.lat},${b.lng}&mode=${VMODE_API[mode]}`)
      const j = r.ok ? await r.json() : { available: false }
      vRouteCache.set(key, j)
      return j
    } catch {
      return { available: false }
    }
  }

  /**
   * The derived leg between two cards.
   *
   * Filters by the modes the trip declares, preselects as the crow flies (free),
   * checks against the API, and ESCALATES when a ceiling is broken — walking
   * over 30 min, cycling over 45. The 20–30 min grey zone shows both, because
   * "22 minutes on foot or 6 by car" is the actual decision somebody makes.
   */
  async function vliaison(a, b, modes) {
    if (!a || !b || a.lat == null || b.lat == null) return null
    const d = vkmOf(a, b)
    if (d < 0.08) return null
    const has = (m) => modes.includes(m)
    const fmt = (r) => `${VMODE_ICO[r.m]} ${vmin(r.s)}${r.km >= 8 ? ' · ' + Math.round(r.km) + ' km' : ''}`
    const one = async (m) => {
      const r = await vroute(a, b, m)
      return r.available ? { m, s: r.seconds, km: (r.meters || 0) / 1000 } : null
    }
    const pick =
      d <= 2 && has('marche') ? 'marche'
      : d <= 6 && has('velo') ? 'velo'
      : has('voiture') ? 'voiture'
      : has('transport') ? 'transport'
      : modes[0]
    if (!pick) return null
    const r1 = await one(pick)
    if (!r1) return null
    const cap = { marche: 1800, velo: 2700 }[pick]
    if (cap && r1.s > cap) {
      const up = has('voiture') ? 'voiture' : has('transport') ? 'transport' : null
      if (up) {
        const r2 = await one(up)
        if (r2) return fmt(r2)
      }
    }
    if (pick === 'marche' && r1.s > 1200 && r1.s <= 1800 && has('voiture')) {
      const r2 = await one('voiture')
      if (r2) return fmt(r1) + ' · ' + fmt(r2)
    }
    return fmt(r1)
  }

  async function renderHub() {
    crumbs([{ label: t('Trips'), hash: '#/voyages' }])
    page.innerHTML = `<div class="vwrap-outer"><div class="empty">${t('loading…')}</div></div>`
    let list
    try {
      const r = await call('/voyages', { cache: 'no-store' })
      list = (await r.json()).voyages
    } catch {
      page.innerHTML = `<div class="vwrap-outer"><div class="empty">${t('Trips are unavailable.')}</div></div>`
      return
    }

    let html = `<div class="vwrap-outer"><header class="chead"><div class="aico">🌴</div><div><h1>${t('Trips')}</h1><div class="lede">${t('One folder per trip — bookings, suggestions, a timeline to compose.')}</div></div></header>`
    if (!list.length) {
      page.innerHTML = html + `<div class="empty">${t('No trip yet — ask the agent to frame one.')}</div></div>`
      return
    }

    const vCard = (v) => {
      const dates = v.debut ? `${vfmtDay(v.debut)} → ${vfmtDay(v.fin)}` : t('no dates — an idea to frame')
      const foot = []
      if (v.status) foot.push(`<span class="stat stat--${tone(v.status)}">${esc(v.status)}</span>`)
      if (v.confirmes) foot.push(`<span class="tag">${v.confirmes} ${t('confirmed')}${v.confirmes > 1 ? 's' : ''}</span>`)
      if (v.suggestions) foot.push(`<span class="tag">💡 ${v.suggestions}</span>`)
      return `<a class="vhub-card" href="#/voyages/${encodeURIComponent(v.path)}"><div class="ct">${esc(v.titre)}</div><div class="cmeta">${esc(dates)}${v.lieux?.length ? ' · ' + esc(v.lieux.join(' → ')) : ''}</div>${foot.length ? `<div class="foot">${foot.join('')}</div>` : ''}</a>`
    }

    // The same rule as pages: a closed trip leaves the grid for the archive
    // drawer. Sorted on the DECLARED status, never on the dates — a date in the
    // past does not archive a trip still being consolidated; closing it does.
    const vivants = list.filter((v) => !finished(v.status))
    const clos = list.filter((v) => finished(v.status))
    if (vivants.length) html += `<div class="vhub">${vivants.map(vCard).join('')}</div>`
    if (clos.length) {
      html += `<details class="archsec"${vivants.length ? '' : ' open'}><summary>🗄️ ${t('Archive')} <span class="hint">— ${clos.length} ${t('trips closed')}</span></summary><div class="vhub">${clos.map(vCard).join('')}</div></details>`
    }
    page.innerHTML = html + '</div>'
  }

  async function renderVoyage(path) {
    crumbs([{ label: t('Trips'), hash: '#/voyages' }, { label: '…', hash: '#/voyages/' + encodeURIComponent(path) }])
    page.innerHTML = `<div class="vwrap-outer"><div class="empty">${t('loading…')}</div></div>`
    let data, state
    try {
      const [rd, rs] = await Promise.all([
        call('/voyage?path=' + encodeURIComponent(path), { cache: 'no-store' }),
        call('/state?v=' + encodeURIComponent(path), { cache: 'no-store' }),
      ])
      if (!rd.ok) throw new Error(rd.status)
      data = await rd.json()
      state = await rs.json()
    } catch (error) {
      page.innerHTML = `<div class="vwrap-outer"><div class="empty">${t('Unreadable trip')} (${esc(String(error))}).</div></div>`
      return
    }
    voy = { path, data, state, filter: null, fiches: [] }
    // The folder listing below. A failure costs the block, never the timeline.
    voy.fiches = await folderPages(path).catch(() => [])
    crumbs([
      { label: t('Trips'), hash: '#/voyages' },
      { label: data.titre || t('Trip'), hash: '#/voyages/' + encodeURIComponent(path) },
    ])
    paintVoyage()
  }

  const vItems = () => {
    const overlay = voy.state.items || {}
    return (voy.data.items || []).map((item) => {
      const { ts: _ts, ...gesture } = overlay[item.id] || {}
      return { ...item, ...gesture }
    })
  }
  const vDir = () => voy.path.replace(/assets\/voyage\.json$/, '')

  /**
   * A card's INTERNAL link — `fiche` in voyage.json.
   *
   * Distinct from `web`, which is external by contract (the venue's own site,
   * new tab). Without this field a card that wants to point at a page of the
   * memory had nothing, so the agent put an absolute URL in `web` — which works
   * and lies about the label. Both coexist on the same card, and that is the
   * normal case: the restaurant's site on one side, the note somebody wrote on
   * the other.
   */
  function vfichePath(rel) {
    if (!rel) return null
    if (/^[a-z]+:|^\//i.test(rel)) return null // a URL is not a page
    return vDir() + rel
  }

  /**
   * The pages in the trip's folder — the anti-ORPHAN net.
   *
   * `#/voyages/<path>` draws the TIMELINE, not a folder listing, and the folder
   * is absorbed by this plugin's tile. So a `.md` written there exists for
   * nobody unless something points at it. A card can (`fiche`), but leaning on
   * that would put discoverability behind an optional field: this block lists
   * what the folder holds, pointed at or not.
   */
  async function folderPages(voyagePath) {
    const dir = voyagePath.replace(/assets\/voyage\.json$/, '').replace(/\/$/, '')
    if (!dir) return []
    const response = await shellFetch('/api/pages/index')
    if (!response.ok) return []
    const { entries } = await response.json()
    return entries
      .filter((entry) => entry.path.startsWith(dir + '/') && !entry.path.slice(dir.length + 1).includes('/'))
      .map((entry) => ({ path: entry.path, nom: entry.title }))
      .sort((a, b) => a.nom.localeCompare(b.nom, locale))
  }

  async function vgesture(payload) {
    try {
      const r = await call('/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ v: voy.path, ...payload }),
      })
      if (!r.ok) {
        window.alert(`${t('Gesture refused')} : ${(await r.json()).error || r.status}`)
        return
      }
      voy.state = await r.json()
    } catch (error) {
      window.alert(`${t('Gesture impossible')} : ${String(error)}`)
    }
    paintVoyage()
  }

  function vitemHTML(item, extra) {
    const T = vtypeOf(item.type)
    const chips = []
    if (item.heure) chips.push(`<span class="chip">${esc(item.heure)}</span>`)
    if (item.duree) chips.push(`<span class="chip">◷ ${esc(item.duree)}</span>`)
    if (item.prix) chips.push(`<span class="chip">${esc(item.prix)}</span>`)
    if (item.gmail) chips.push('<span class="chip due">📧 résa</span>')
    // Knowing a card carries a page WITHOUT opening it: otherwise the link only
    // exists for whoever thinks to click, and we are back to the orphan.
    if (item.fiche) chips.push(`<span class="chip">📄 ${t('page')}</span>`)
    return `<div class="vcard" draggable="true" title="${t('Click: page · Drag: move')}" data-vi="${esc(item.id)}" style="--ic:var(${T.c})"><span class="vico">${vicoOf(item)}</span><div class="bd"><div class="vt">${esc(item.titre || item.id)}</div>${chips.length ? `<div class="vmeta">${chips.join('')}</div>` : ''}</div>${extra || ''}</div>`
  }

  function paintVoyage() {
    vdrag = false
    vdragId = null // the DOM is rebuilt; no drag survives a render
    const d = voy.data
    const items = vItems()
    const allSug = items.filter((i) => i.statut === 'suggestion')
    const sug = allSug.filter((i) => !voy.filter || i.type === voy.filter)
    const nEc = items.filter((i) => i.statut === 'ecartee').length
    const modes = d.modes || ['marche', 'voiture']
    const modesTags = modes.map((m) => `<span class="tag">${VMODE_ICO[m] || ''} ${esc(m)}</span>`).join('')
    const props = `<div class="props"><span class="k">${t('Status')}</span><span class="stat stat--${tone(d.status)}">${esc(d.status || '—')}</span>${d.debut ? `<span class="k">${t('Dates')}</span><span class="tag">${vfmtDay(d.debut)} → ${vfmtDay(d.fin)}</span>` : ''}<span class="k">${t('Modes')}</span>${modesTags}</div>`
    const head = `<header class="chead"><div class="aico">🌴</div><div><h1>${esc(d.titre || t('Trip'))}</h1><div class="lede">%LEDE%</div></div></header>`

    // An "idea" trip: no timeline, the tray alone — nothing confirms without dates.
    if (!d.debut || !d.fin) {
      page.innerHTML = `<div class="vwrap-outer">${head.replace('%LEDE%', t('An idea for now — the tray is live, the timeline waits for dates.'))}${props}
        <div class="vnote">🗓️ <b>${t('Set the dates to compose')}</b> ${t('— tell the agent. Without a start and an end, nothing can be confirmed.')}</div>
        <div class="grouplabel">${t('Suggestions')} <span class="hint">${t('— from the agent, in the meantime')}</span></div>
        <div class="vhub">${allSug.map((i) => `<button class="vhub-card" data-open="${esc(i.id)}"><div class="ct">${vicoOf(i)} ${esc(i.titre || i.id)}</div><div class="cmeta">${esc(i.hint || '')}</div><div class="foot"><span class="tag">${vtypeName(i.type)}</span></div></button>`).join('') || `<div class="empty">${t('No suggestion — ask the agent for some.')}</div>`}</div></div>`
      page.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openVFiche(b.dataset.open)))
      return
    }

    const days = vdaysOf(d.debut, d.fin)
    const liaisons = [] // {id, a, b, first} — filled after the paint, asynchronously
    const tl = days
      .map((day) => {
        const band = items.find((i) => i.statut === 'confirme' && i.debut && i.fin && i.debut <= day && day < i.fin)
        const cards = items
          .filter((i) => i.statut === 'confirme' && i.jour === day)
          .sort((a, b) => vrank(a) - vrank(b) || String(a.heure || '').localeCompare(String(b.heure || '')))
        let flow = ''
        let prev = band && band.lat != null ? band : null
        cards.forEach((c, ix) => {
          if (prev && c.lat != null) {
            const id = `vlia-${day}-${ix}`
            liaisons.push({ id, a: prev, b: c, first: ix === 0 && !!band })
            flow += `<div class="vlink" id="${id}"><span class="lb">…</span></div>`
          }
          flow += vitemHTML(c)
          if (c.lat != null) prev = c
        })
        if (!cards.length) flow = `<div class="vfree">${t('— free day — drop a card here')}</div>`
        // The stay CLOSES the day: it is the night, not the morning's plan. It
        // stays the reference for the first leg ("from the hotel · …"), which
        // reads at the top — you set out from where you slept.
        return `<div class="vday" data-day="${day}"><div class="vday-h"><span class="dn">${vfmtDay(day)}</span><span class="wx na" data-wx="${day}"></span></div><div class="vflow">${flow}</div>${band ? `<div class="vband" data-open="${esc(band.id)}">${vicoOf(band)} ${esc(band.titre || band.id)}<span class="fx">${band.debut === day ? t('arrival · night here') : t('night here')}</span></div>` : ''}</div>`
      })
      .join('')

    const types = [...new Set(allSug.map((i) => i.type))]
    const tray = `<aside class="vtray"><div class="th">${t('Suggestions')} <span class="cnt">${allSug.length}</span></div>
      ${types.length > 1 ? `<div class="facets">${['', ...types].map((tp) => `<button class="pill ${(!tp && !voy.filter) || voy.filter === tp ? 'on' : ''}" data-tf="${esc(tp)}">${tp ? vtypeName(tp) : t('All')}</button>`).join('')}</div>` : ''}
      <div class="traygrid">${sug.map((i) => `<div class="traycard" draggable="true" title="${t('Click: page · Drag: confirm')}" data-vi="${esc(i.id)}" style="--ic:var(${vtypeOf(i.type).c})"><button class="dis" data-dis="${esc(i.id)}" title="${t('Dismiss — kept, never suggested again')}">✕</button><span class="vico">${vicoOf(i)}</span><div class="bd"><div class="vt">${esc(i.titre || i.id)}</div>${i.hint ? `<div class="vhint">${esc(i.hint)}</div>` : ''}${i.prix ? `<div class="vmeta"><span class="chip">${esc(i.prix)}</span></div>` : ''}</div></div>`).join('') || `<div class="empty">${t('Nothing to sort — ask the agent for suggestions.')}</div>`}</div>
      <div class="trayfoot">🖐 ${t('A card on a day = confirmed · a card from the plan back here = returned to suggestions')}${nEc ? ` · <button class="eclink" data-ectoggle>${nEc} ${t('dismissed')}${nEc > 1 ? 's' : ''} ${voy.showEc ? '▾' : '▸'}</button>` : ''}</div>
      ${voy.showEc && nEc ? `<div class="traygrid">${items.filter((i) => i.statut === 'ecartee').map((i) => `<div class="traycard ec" data-vi="${esc(i.id)}"><button class="dis" data-rest="${esc(i.id)}" title="${t('Take back into the suggestions')}" style="opacity:1">↺</button><span class="vico">${vicoOf(i)}</span><div class="bd"><div class="vt">${esc(i.titre || i.id)}</div>${i.hint ? `<div class="vhint">${esc(i.hint)}</div>` : ''}</div></div>`).join('')}</div>` : ''}</aside>`

    const bloc = voy.fiches.length
      ? `<div class="grouplabel">${t('The pages of this trip')} <span class="hint">${t('— what the folder holds')}</span></div>
      <div class="vhub vdoss">${voy.fiches.map((f) => `<button class="vhub-card" data-page="${esc(f.path)}"><div class="ct">📄 ${esc(f.nom)}</div><div class="foot"><span class="tag">${t('page')}</span></div></button>`).join('')}</div>`
      : ''

    const lede = `${days.length} ${t('days')}${(d.lieux || []).length ? ' · ' + d.lieux.map((l) => esc(l.nom)).join(' → ') : ''} · ${t('legs and weather derived as it draws')}`
    page.innerHTML = `<div class="vwrap-outer">${head.replace('%LEDE%', lede)}${props}<div class="vsplit"><div class="vtl">${tl}</div>${tray}</div>${bloc}</div>`

    // Cards (click), tray (filter, dismiss), drag & drop → the state API.
    page.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openVFiche(b.dataset.open)))
    page.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => openPage(b.dataset.page)))
    page.querySelectorAll('[data-tf]').forEach((b) =>
      b.addEventListener('click', () => {
        voy.filter = b.dataset.tf || null
        paintVoyage()
      }),
    )
    page.querySelectorAll('[data-dis]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        vgesture({ id: b.dataset.dis, statut: 'ecartee' })
      }),
    )
    page.querySelectorAll('[data-rest]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        vgesture({ id: b.dataset.rest, statut: 'suggestion' })
      }),
    )
    const ecT = page.querySelector('[data-ectoggle]')
    if (ecT) {
      ecT.addEventListener('click', () => {
        voy.showEc = !voy.showEc
        paintVoyage()
      })
    }

    page.querySelectorAll('.vcard,.traycard').forEach((c) => {
      c.addEventListener('click', () => {
        if (!vdrag) openVFiche(c.dataset.vi)
      })
      c.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.dataset.vi)
        e.dataTransfer.effectAllowed = 'move'
        c.classList.add('drag')
        vdrag = true
        vdragId = c.dataset.vi
      })
      c.addEventListener('dragend', () => {
        c.classList.remove('drag')
        vclearIns()
        setTimeout(() => {
          vdrag = false
          vdragId = null
        }, 0)
      })
    })

    page.querySelectorAll('.vday').forEach((dz) => {
      dz.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        dz.classList.add('dropok')
        // The insertion rule: above the card being aimed at, or below the last.
        const { idx, els } = vdropIndex(dz, e.clientY, vdragId)
        vclearIns()
        if (els.length) idx < els.length ? els[idx].classList.add('inst') : els[els.length - 1].classList.add('insb')
      })
      dz.addEventListener('dragleave', (e) => {
        if (!dz.contains(e.relatedTarget)) {
          dz.classList.remove('dropok')
          vclearIns()
        }
      })
      dz.addEventListener('drop', (e) => {
        e.preventDefault()
        dz.classList.remove('dropok')
        vclearIns()
        const it = vItems().find((x) => x.id === e.dataTransfer.getData('text/plain'))
        if (!it || it.debut || it.fin) return // continuous items do not move
        const day = dz.dataset.day
        // Drop position → a fractional rank between the two neighbours.
        const others = vItems()
          .filter((x) => x.statut === 'confirme' && x.jour === day && x.id !== it.id)
          .sort((a, b) => vrank(a) - vrank(b))
        const { idx } = vdropIndex(dz, e.clientY, it.id)
        const r1 = idx > 0 ? vrank(others[idx - 1]) : null
        const r2 = idx < others.length ? vrank(others[idx]) : null
        const ordre = r1 != null && r2 != null ? (r1 + r2) / 2 : r2 != null ? r2 - 10 : r1 != null ? r1 + 10 : 1000
        vgesture({ id: it.id, statut: 'confirme', jour: day, ordre })
      })
    })

    // The inverse gesture: a planned card dragged onto the tray goes back to
    // being a suggestion.
    const trayEl = page.querySelector('.vtray')
    if (trayEl) {
      trayEl.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        trayEl.classList.add('dropok')
      })
      trayEl.addEventListener('dragleave', () => trayEl.classList.remove('dropok'))
      trayEl.addEventListener('drop', (e) => {
        e.preventDefault()
        trayEl.classList.remove('dropok')
        const it = vItems().find((x) => x.id === e.dataTransfer.getData('text/plain'))
        if (!it || it.debut || it.fin || it.statut !== 'confirme') return
        vgesture({ id: it.id, statut: 'suggestion' })
      })
    }

    // Weather (derived): patched into the days the reliable window covers. The
    // others stay empty ahead, "—" behind. The absence, not a fiction.
    const today = new Date().toISOString().slice(0, 10)
    page.querySelectorAll('[data-wx]').forEach((el) => {
      const day = el.dataset.wx
      if (day < today) el.textContent = '—'
      else {
        el.textContent = t('weather at D-10')
        el.title = t('outside the reliable window (D+10) — the icon appears as departure nears')
      }
    })
    call('/weather?v=' + encodeURIComponent(voy.path) + '&lang=' + encodeURIComponent(locale.slice(0, 2)))
      .then((r) => (r.ok ? r.json() : null))
      .then((wx) => {
        if (!wx || !wx.available) return
        page.querySelectorAll('[data-wx]').forEach((el) => {
          const w = wx.days[el.dataset.wx]
          if (!w) return
          el.className = 'wx'
          el.textContent = `${wxIco(w.type)} ${w.tmax != null ? Math.round(w.tmax) + '°' : ''}`
          if (w.desc) el.title = w.desc
        })
      })
      .catch(() => {})

    // Legs (derived): filled in asynchronously, recomputed on every paint — the
    // chip follows the gesture, and nothing is ever stored.
    const modesDecl = modes.filter((m) => VMODE_API[m])
    for (const L of liaisons) {
      vliaison(L.a, L.b, modesDecl).then((txt) => {
        const el = page.querySelector('#' + L.id)
        if (!el) return
        if (!txt) {
          el.remove()
          return
        }
        el.querySelector('.lb').textContent = (L.first ? t('from the hotel · ') : '') + txt
      })
    }
  }

  /**
   * One card, in full.
   *
   * A dialog rather than a page: a suggestion is something you look at without
   * losing the timeline you were composing. It lives in the plugin's own
   * subtree — appended to `document.body` in the predecessor, which left one
   * behind on every navigation.
   */
  const vModal = document.createElement('div')
  vModal.className = 'vmodal'
  vModal.hidden = true
  vModal.innerHTML = '<div class="vfiche"></div>'
  vModal.addEventListener('click', (e) => {
    if (e.target === vModal) vModal.hidden = true
  })

  function openVFiche(id) {
    const it = vItems().find((x) => x.id === id)
    if (!it) return
    const T = vtypeOf(it.type)
    const cal =
      it.jour ?
        vfmtDay(it.jour) + (it.heure ? ' · ' + esc(it.heure) : it.creneau ? ' · ' + (CRN[it.creneau] || esc(it.creneau)) : '')
      : it.debut ? `${vfmtDay(it.debut)} → ${vfmtDay(it.fin)}`
      : t('to be placed on the timeline')
    const stTone = { suggestion: 'underway', confirme: 'settled', ecartee: 'waiting' }[it.statut] || 'underway'
    const stLbl = { suggestion: t('suggestion'), confirme: t('confirmed item'), ecartee: t('dismissed') }[it.statut] || it.statut
    const chips = [
      it.duree ? `<span class="chip">◷ ${esc(it.duree)}</span>` : '',
      it.prix ? `<span class="chip">${esc(it.prix)}</span>` : '',
    ]
      .filter(Boolean)
      .join('')
    const desc = it.desc || it.hint || ''
    const src =
      it.gmail ? `<div class="vsrc">📧 ${t('Booking found in the mailbox — the thread stays the source of truth.')}</div>`
      : it.place_id ? `<div class="vsrc">📍 ${t('Maps entry — rating, hours, directions.')}</div>`
      : ''
    const docs = (it.docs || [])
      .map(
        (doc) =>
          `<a class="vdoc" href="/api/plugin/voyages/doc?v=${encodeURIComponent(voy.path)}&file=${encodeURIComponent(doc.fichier)}"><span class="ext">${esc((doc.fichier.split('.').pop() || 'doc').toUpperCase())}</span><div><div class="fn">${esc(doc.titre || doc.fichier)}</div><div class="fs">${esc(doc.fichier)}</div></div></a>`,
      )
      .join('')

    const fiche = vfichePath(it.fiche)
    const body = vModal.querySelector('.vfiche')
    body.innerHTML = `<div class="vhead"><span class="vico">${vicoOf(it)}</span><div><div class="vst">${esc(it.titre || it.id)}</div><div class="vsub">${vtypeName(it.type)} · <span class="stat stat--${stTone}">${esc(stLbl)}</span> · ${cal}</div></div></div>
      ${desc ? `<div class="vby">🎩 ${t('the agent’s note')}</div><p class="vdesc">${esc(desc)}</p>` : ''}
      ${chips ? `<div class="vmeta">${chips}</div>` : ''}${src}${docs}
      ${it.statut === 'confirme' && !it.debut ? `<div class="vhour"><span class="vby" style="margin:0">${t('Hour')}</span><input type="time" data-hour value="${esc(String(it.heure || '').replace('h', ':'))}"><button class="vopen" data-sethour>${t('Set')}</button>${it.heure ? `<button class="vopen" data-clearhour>${t('Clear')}</button>` : ''}<span class="vhint">${t('optional — the order of the cards makes the day, the hour annotates it')}</span></div>` : ''}
      <div class="vactions">${fiche ? `<button class="vopen prim" data-openpage="${esc(fiche)}">📄 ${t('See the page')}</button>` : ''}${it.web ? `<a class="vopen" href="${esc(it.web)}" target="_blank" rel="noreferrer">↗ ${t('Open the site')}</a>` : ''}${it.statut === 'confirme' && !it.debut ? `<button class="vopen" data-untray>↩ ${t('Return to suggestions')}</button>` : ''}${it.statut !== 'ecartee' && !it.debut ? `<button class="vopen crit" data-ecarter>✕ ${t('Dismiss')}</button>` : ''}${it.statut === 'ecartee' ? `<button class="vopen" data-restfiche>↺ ${t('Take back into the suggestions')}</button>` : ''}${it.statut === 'suggestion' ? `<span class="vhint">🖐 ${t('drag the card onto a day to confirm')}</span>` : ''}
      <span style="flex:1"></span><button class="vopen" data-close>${t('Close')}</button></div>`

    const close = () => {
      vModal.hidden = true
    }
    body.querySelector('[data-close]').addEventListener('click', close)
    // Without this the dialog stays open over the page, and going back lands on
    // a card somebody thought they had left.
    body.querySelector('[data-openpage]')?.addEventListener('click', (e) => {
      close()
      openPage(e.currentTarget.dataset.openpage)
    })
    body.querySelector('[data-untray]')?.addEventListener('click', () => {
      close()
      vgesture({ id: it.id, statut: 'suggestion' })
    })
    body.querySelector('[data-ecarter]')?.addEventListener('click', () => {
      close()
      vgesture({ id: it.id, statut: 'ecartee' })
    })
    body.querySelector('[data-restfiche]')?.addEventListener('click', () => {
      close()
      vgesture({ id: it.id, statut: 'suggestion' })
    })
    // Set/clear the hour: day and rank are re-sent as they are, only the hour
    // changes.
    body.querySelector('[data-sethour]')?.addEventListener('click', () => {
      const value = body.querySelector('[data-hour]').value
      close()
      vgesture({ id: it.id, statut: 'confirme', jour: it.jour, ordre: vrank(it), heure: value || null })
    })
    body.querySelector('[data-clearhour]')?.addEventListener('click', () => {
      close()
      vgesture({ id: it.id, statut: 'confirme', jour: it.jour, ordre: vrank(it), heure: null })
    })
    vModal.hidden = false
  }

  return {
    /** The dialog the host must place in this plugin's subtree. */
    modal: vModal,
    hub: renderHub,
    voyage: renderVoyage,
  }
}
