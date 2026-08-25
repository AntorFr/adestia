/**
 * Trips: what is written, what is gestured, and what is merely derived.
 *
 * Three kinds of data live here and the whole design is about keeping them
 * apart — the same frontier the workbench draws, for the same reason:
 *
 * - the DATA (`assets/voyage.json`) is written by the agent and reviewed like
 *   any other file. Nothing in this module ever writes it.
 * - the GESTURES of the timeline (confirm, move, dismiss) land in a SIBLING
 *   `voyage-state.json`. A drag is not an edit of your trip; consolidating the
 *   overlay back into the trip is a decision somebody makes.
 * - the DERIVED bits — a day's weather, the leg between two cards — are
 *   computed on demand against Google's APIs and cached in process, never
 *   written anywhere. Without a key they answer "unavailable" and the front
 *   draws the absence rather than a fiction.
 *
 * The key arrives as a DECLARED SECRET (`opts.secrets`), which is why this
 * plugin can be active on an instance that has none: the trip still renders,
 * the derived chips simply say nothing. That degradation is the contract, not
 * a fallback — a household without a Maps key still plans holidays.
 */

import { createReadStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const VOYAGE = 'voyage.json'
const TIMEOUT = 12_000

/** Closed vocabularies, enforced server-side: an overlay cannot invent a word. */
const STATUTS = new Set(['suggestion', 'confirme', 'ecartee'])
const CRENEAUX = new Set(['matin', 'midi', 'apres-midi', 'soir'])
const MODES = new Set(['WALK', 'DRIVE', 'BICYCLE', 'TRANSIT'])

const DATE = /^\d{4}-\d{2}-\d{2}$/
const HEURE = /^\d{1,2}[:h]\d{2}$/
const LATLNG = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/

/**
 * Walks for `**\/assets/voyage.json`.
 *
 * Convention rather than declaration, like workbooks: a trip is a folder that
 * carries its data in its own assets, so creating one is writing a file. There
 * is no registry to keep in sync and nothing to forget.
 */
async function findVoyages(root, prefix = '', depth = 0) {
  if (depth > 6) return []
  let entries
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true })
  } catch {
    return []
  }

  const found = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      found.push(...(await findVoyages(root, path, depth + 1)))
    } else if (entry.name === VOYAGE && prefix.endsWith('/assets')) {
      found.push(path)
    }
  }
  return found
}

/** A path from a query string is user input, wherever it looks like it came from. */
export function safeVoyagePath(root, requested) {
  if (typeof requested !== 'string' || requested.includes('\0')) return undefined
  const target = resolve(root, `./${requested.replace(/^\/+/, '')}`)
  const rel = relative(root, target)
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) return undefined
  if (!target.endsWith(`${sep}${VOYAGE}`)) return undefined
  return target
}

/** `…/assets/voyage.json` → `…/assets/voyage-state.json`. Beside, never inside. */
export const overlayPath = (voyage) => join(dirname(voyage), 'voyage-state.json')

/**
 * A document a card points at, resolved against ITS OWN TRIP.
 *
 * Two arguments rather than one path, deliberately. The caller names the trip
 * and the file, and the file is only reachable inside that trip's folder — so
 * this route can serve a boarding pass without becoming a way to read any file
 * under the workspace. A document is a thing a trip carries, and the boundary
 * says exactly that.
 */
export function safeDocPath(root, voyage, requested) {
  if (typeof requested !== 'string' || requested === '' || requested.includes('\0')) {
    return undefined
  }
  // `assets/x.pdf` is written relative to the TRIP folder, which is the parent
  // of the assets folder the voyage.json sits in.
  const trip = dirname(dirname(voyage))
  const target = resolve(trip, `./${requested.replace(/^\/+/, '')}`)
  const rel = relative(trip, target)
  if (rel === '' || rel.startsWith('..') || rel.startsWith(`..${sep}`)) return undefined
  // And still inside the workspace, in case the trip folder is itself a link.
  const outer = relative(root, target)
  if (outer.startsWith('..') || outer.startsWith(`..${sep}`)) return undefined
  return target
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  // Atomic: the agent may be reading this while a drag writes it, and a
  // half-written overlay is a trip that renders wrong rather than one that
  // fails to load.
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 1))
  await rename(temporary, path)
}

const emptyState = () => ({ items: {} })

/** The trip's items, with each gesture laid over the one it belongs to. */
export function mergeItems(data, state) {
  const overlay = state?.items ?? {}
  return (data.items ?? []).map((item) => {
    const { ts: _stamp, ...gesture } = overlay[item.id ?? ''] ?? {}
    return { ...item, ...gesture }
  })
}

/**
 * One card's worth of a trip.
 *
 * Every field here is read by the hub's markup, which is why this is a named
 * function rather than an object literal inside a route — the same lesson the
 * workbench learned when `undefined/4 étapes` reached a screen.
 */
export function summarise(path, data, state) {
  const items = mergeItems(data, state)
  const stamps = Object.values(state?.items ?? {})
    .map((gesture) => gesture?.ts)
    .filter((value) => typeof value === 'string')
  return {
    path,
    titre: data.titre ?? path.split('/').at(-3) ?? path,
    status: data.status ?? null,
    debut: data.debut ?? null,
    fin: data.fin ?? null,
    lieux: (data.lieux ?? []).map((place) => place?.nom).filter(Boolean),
    confirmes: items.filter((item) => item.statut === 'confirme').length,
    suggestions: items.filter((item) => item.statut === 'suggestion').length,
    lastActivity: stamps.sort().at(-1) ?? null,
  }
}

/**
 * Reads one gesture, or says why it is refused.
 *
 * Validated against the trip rather than trusted: an overlay may not invent an
 * item, nor place one outside the dates its trip declares. Returns either
 * `{ error }` or the exact patch to store, so the route stays a route and this
 * stays testable without a server.
 */
export function readGesture(data, body) {
  const id = typeof body?.id === 'string' ? body.id.trim() : ''
  const base = (data.items ?? []).find((item) => item.id === id)
  if (!base) return { error: 'unknown item' }
  // A continuous item spans nights — it IS the shape of the trip, not a card
  // in a day, so dragging it would mean something the timeline cannot draw.
  if (base.debut || base.fin) return { error: 'continuous items are not movable' }

  const statut = body?.statut
  if (!STATUTS.has(statut)) return { error: 'bad statut' }

  if (statut !== 'confirme') {
    // Back to the tray, or dismissed: the placement goes with it. An item that
    // is not confirmed is never placed — that invariant holds even when the
    // placement came from voyage.json itself.
    return { patch: { statut, jour: null, creneau: null, ordre: null, heure: null }, replace: true }
  }

  const jour = body?.jour ?? ''
  if (!DATE.test(jour)) return { error: 'confirme requires jour' }
  if (!data.debut || !data.fin) return { error: 'voyage has no dates yet' }
  if (!(data.debut <= jour && jour <= data.fin)) return { error: 'jour outside voyage' }

  const patch = { statut, jour }

  if (body?.creneau !== undefined && body?.creneau !== null) {
    if (!CRENEAUX.has(body.creneau)) return { error: 'bad creneau' }
    patch.creneau = body.creneau
  }

  // The ORDER of the cards is the shape of the day: a rank set by the drop,
  // fractional so that inserting between two neighbours renumbers nobody.
  if (body?.ordre !== undefined && body?.ordre !== null) {
    if (typeof body.ordre !== 'number' || !Number.isFinite(body.ordre)) {
      return { error: 'bad ordre' }
    }
    patch.ordre = body.ordre
  }

  // The hour is an optional ANNOTATION, never a grid: absent from the body
  // leaves it alone, `null` clears it.
  if ('heure' in (body ?? {})) {
    const heure = body.heure
    if (heure === null || heure === '') patch.heure = null
    else if (typeof heure === 'string' && HEURE.test(heure.trim())) {
      patch.heure = heure.trim().replace('h', ':')
    } else return { error: 'bad heure' }
  }

  return { patch, replace: false }
}

/** A derived value's cache: in process, bounded, and never a file. */
function makeCache(limit = 512) {
  const entries = new Map()
  return {
    get(key) {
      const hit = entries.get(key)
      return hit && hit.until > Date.now() ? hit.value : undefined
    },
    set(key, ttlMs, value) {
      entries.set(key, { until: Date.now() + ttlMs, value })
      if (entries.size > limit) {
        for (const stale of [...entries.keys()].slice(0, limit / 4)) entries.delete(stale)
      }
      return value
    },
  }
}

/** Where a trip is on a given day — the place a card can be measured from. */
export function dayLocation(data, day) {
  const stay = (data.lieux ?? []).find(
    (place) =>
      place?.lat != null &&
      (!place.arrivee || place.arrivee <= day) &&
      (!place.depart || day <= place.depart),
  )
  if (stay) return { lat: stay.lat, lng: stay.lng }
  const anywhere = (data.lieux ?? []).find((place) => place?.lat != null)
  return anywhere ? { lat: anywhere.lat, lng: anywhere.lng } : undefined
}

/** Days from `a` to `b` inclusive, as ISO dates. Noon, so no timezone flips a day. */
export function daysBetween(a, b) {
  const out = []
  const end = new Date(`${b}T12:00:00Z`)
  for (let d = new Date(`${a}T12:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** What a browser should call a served document. */
const MIME = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
}

export default async function api(app, opts) {
  const root = join(opts.workspaceRoot, 'pages')
  // Declared in the manifest, granted by the instance — or absent, which is a
  // supported state rather than a broken one.
  const key = opts.secrets?.GOOGLE_MAPS_API_KEY ?? ''
  const cache = makeCache()

  app.get('/voyages', async () => {
    const paths = await findVoyages(root)
    const voyages = []
    for (const path of paths.sort()) {
      const file = join(root, path)
      const data = await readJson(file, null)
      if (!data) continue
      voyages.push(summarise(path, data, await readJson(overlayPath(file), emptyState())))
    }
    // The ones with dates first, in date order; the ideas after. A trip that
    // is happening outranks a trip somebody is dreaming about.
    voyages.sort(
      (a, b) =>
        Number(a.debut === null) - Number(b.debut === null) ||
        String(a.debut ?? '').localeCompare(String(b.debut ?? '')) ||
        String(a.titre).localeCompare(String(b.titre), 'fr'),
    )
    return { voyages }
  })

  app.get('/voyage', async (request, reply) => {
    const path = safeVoyagePath(root, request.query.path)
    if (!path) return reply.code(400).send({ error: 'not a voyage path' })
    const data = await readJson(path, null)
    if (!data) return reply.code(404).send({ error: 'no voyage there' })
    return data
  })

  app.get('/state', async (request, reply) => {
    const path = safeVoyagePath(root, request.query.v)
    if (!path) return reply.code(400).send({ error: 'not a voyage path' })
    return readJson(overlayPath(path), emptyState())
  })

  app.post('/state', async (request, reply) => {
    const path = safeVoyagePath(root, request.body?.v)
    if (!path) return reply.code(400).send({ error: 'not a voyage path' })
    const data = await readJson(path, null)
    if (!data) return reply.code(404).send({ error: 'no voyage there' })

    const { error, patch, replace } = readGesture(data, request.body)
    if (error) return reply.code(400).send({ error })

    const file = overlayPath(path)
    const state = await readJson(file, emptyState())
    state.items ??= {}
    const stamped = { ...patch, ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z') }
    // Moving a card does not lose its annotations: a confirmation MERGES over
    // what was there, so an hour survives a change of day. Dismissing and
    // untraying replace outright — their patch nulls the placement on purpose.
    state.items[request.body.id] = replace
      ? stamped
      : { ...(state.items[request.body.id] ?? {}), ...stamped }

    await writeJson(file, state)
    return state
  })

  app.get('/doc', async (request, reply) => {
    const voyage = safeVoyagePath(root, request.query.v)
    if (!voyage) return reply.code(400).send({ error: 'not a voyage path' })
    const file = safeDocPath(root, voyage, request.query.file)
    if (!file) return reply.code(400).send({ error: 'not a document of this trip' })
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('not a file')
    } catch {
      return reply.code(404).send({ error: 'no such document' })
    }
    const name = file.split(sep).at(-1)
    return reply
      .type(MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
      // Attachment: a boarding pass is something you keep, and a PDF rendered
      // inside the shell would replace the trip somebody was looking at.
      .header('content-disposition', `attachment; filename="${name.replace(/["\\]/g, '')}"`)
      .send(createReadStream(file))
  })

  /**
   * A day-by-day forecast for the trip.
   *
   * Only the RELIABLE window — Google gives ten days — and only the days the
   * trip actually covers. A day outside that window is simply absent from the
   * answer, which the front draws as "not yet" rather than inventing a sun.
   */
  app.get('/weather', async (request, reply) => {
    const path = safeVoyagePath(root, request.query.v)
    if (!path) return reply.code(400).send({ error: 'not a voyage path' })
    if (!key) return { available: false, days: {} }
    // The language a description comes back in. Asked for by the caller,
    // because the front is what knows the instance's locale — a plugin's API
    // is handed paths, not words.
    const lang = /^[a-z]{2}$/.test(request.query.lang ?? '') ? request.query.lang : 'en'
    const data = await readJson(path, null)
    if (!data) return reply.code(404).send({ error: 'no voyage there' })
    if (!data.debut || !data.fin) return { available: true, days: {} }

    const today = new Date().toISOString().slice(0, 10)
    const days = {}
    for (const day of daysBetween(data.debut, data.fin)) {
      if (day < today) continue
      const spot = dayLocation(data, day)
      if (!spot) continue
      const forecast = await forecastFor(spot, lang)
      if (forecast[day]) days[day] = forecast[day]
    }
    return { available: true, days }
  })

  async function forecastFor({ lat, lng }, lang) {
    const id = `wx:${lat.toFixed(3)},${lng.toFixed(3)}:${lang}`
    const hit = cache.get(id)
    if (hit) return hit

    const url = new URL('https://weather.googleapis.com/v1/forecast/days:lookup')
    url.search = new URLSearchParams({
      key,
      'location.latitude': String(lat),
      'location.longitude': String(lng),
      days: '10',
      unitsSystem: 'METRIC',
      languageCode: lang,
    }).toString()

    let payload
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
      // No cache on a failure: a transient error is not an absence of weather,
      // and caching it would keep the trip grey for an hour.
      if (!response.ok) return {}
      payload = await response.json()
    } catch {
      return {}
    }

    const days = {}
    for (const day of payload.forecastDays ?? []) {
      const shown = day.displayDate ?? {}
      if (!shown.year) continue
      const iso = `${shown.year}-${String(shown.month).padStart(2, '0')}-${String(shown.day).padStart(2, '0')}`
      const condition = day.daytimeForecast?.weatherCondition ?? {}
      days[iso] = {
        type: condition.type ?? null,
        desc: condition.description?.text ?? null,
        tmax: day.maxTemperature?.degrees ?? null,
        tmin: day.minTemperature?.degrees ?? null,
      }
    }
    return cache.set(id, 3_600_000, days)
  }

  /**
   * How long between two cards.
   *
   * Traffic-unaware on purpose: an approximation is the contract of a holiday,
   * and it makes the answer cacheable for a day rather than for a minute.
   */
  app.get('/route', async (request, reply) => {
    if (!key) return { available: false }
    const from = LATLNG.exec(request.query.frm ?? '')
    const to = LATLNG.exec(request.query.to ?? '')
    const mode = String(request.query.mode ?? 'WALK').toUpperCase()
    if (!from || !to || !MODES.has(mode)) {
      return reply.code(400).send({ error: 'frm/to must be lat,lng; bad mode' })
    }

    const a = { lat: Number(from[1]).toFixed(4), lng: Number(from[2]).toFixed(4) }
    const b = { lat: Number(to[1]).toFixed(4), lng: Number(to[2]).toFixed(4) }
    const id = `route:${a.lat},${a.lng}|${b.lat},${b.lng}|${mode}`
    const hit = cache.get(id)
    if (hit) return hit

    const body = {
      origin: { location: { latLng: { latitude: Number(a.lat), longitude: Number(a.lng) } } },
      destination: { location: { latLng: { latitude: Number(b.lat), longitude: Number(b.lng) } } },
      travelMode: mode,
      ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_UNAWARE' } : {}),
    }

    let routes = []
    try {
      const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT),
      })
      if (response.ok) routes = (await response.json()).routes ?? []
    } catch {
      return { available: false }
    }
    if (routes.length === 0) return { available: false }

    return cache.set(id, 86_400_000, {
      available: true,
      seconds: Number.parseInt(String(routes[0].duration ?? '0s'), 10),
      meters: routes[0].distanceMeters ?? 0,
    })
  })
}
