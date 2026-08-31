/**
 * What was actually SAID, turned into something a person and a grep can both
 * read.
 *
 * A caption file is not a transcript. YouTube's automatic ones are a rolling
 * window — each cue repeats most of the previous one so the words scroll on
 * screen — so a naïve concatenation triples the text and makes every search
 * hit three times in a row. Everything in this file exists because of that:
 * de-duplicate the roll, glue the fragments back into sentences, and keep the
 * SECOND each sentence starts at, because a timestamp is what turns a note
 * into "here, watch this bit".
 *
 * The stored form is plain text — `[00:12:31] une phrase` per line — and that
 * is deliberate. It is greppable with the agent's own file tools, readable in
 * the page editor, diffable in git, and it survives this plugin being removed.
 */

const CUE = /^(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/

/** `01:02:03.400` → 3723. */
export function toSeconds(stamp) {
  const parts = String(stamp).trim().replace(',', '.').split(':').map(Number)
  if (parts.some((piece) => !Number.isFinite(piece))) return 0
  return Math.floor(parts.reduce((total, piece) => total * 60 + piece, 0))
}

/** 3723 → `01:02:03`, the spelling the stored transcript uses. */
export function toStamp(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0))
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60]
    .map((piece) => String(piece).padStart(2, '0'))
    .join(':')
}

const clean = (line) =>
  line
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * A caption file → `[{ t, text }]`, one entry per SENTENCE-ish chunk.
 *
 * `chunk` is how many characters a line grows to before it is closed. Long
 * enough that a search hit reads as a thought rather than as three words,
 * short enough that the timestamp still points at the right moment.
 */
export function parseCaptions(source, { chunk = 220 } = {}) {
  const cues = []
  let current = null

  for (const raw of String(source ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (CUE.test(line)) {
      current = { t: toSeconds(line.split('-->')[0]), text: '' }
      cues.push(current)
      continue
    }
    if (!current || !line || /^WEBVTT|^Kind:|^Language:|^\d+$/.test(line)) continue
    const text = clean(line)
    if (text) current.text = current.text ? `${current.text} ${text}` : text
  }

  // The roll: keep only what each cue ADDS to the one before it. Written as a
  // suffix test rather than an equality test because the window slides by a
  // word or two, so consecutive cues overlap without ever being equal.
  const said = []
  let previous = ''
  for (const cue of cues) {
    if (!cue.text) continue
    let text = cue.text
    if (previous) {
      if (previous.endsWith(text) || previous === text) continue
      const overlap = longestOverlap(previous, text)
      if (overlap) text = text.slice(overlap).trim()
    }
    if (!text) continue
    said.push({ t: cue.t, text })
    previous = cue.text
  }

  // Sentences, not fragments: a caption breaks mid-clause, and a hit on half
  // a clause tells nobody anything.
  const lines = []
  let open = null
  for (const piece of said) {
    if (!open) open = { t: piece.t, text: piece.text }
    else open.text = `${open.text} ${piece.text}`
    if (open.text.length >= chunk && /[.?!…]\s*$|[.?!…]\s/.test(`${open.text} `)) {
      lines.push(open)
      open = null
    } else if (open.text.length >= chunk * 1.8) {
      lines.push(open)
      open = null
    }
  }
  if (open) lines.push(open)
  return lines
}

/** How much of `next` the tail of `previous` already said. */
function longestOverlap(previous, next) {
  const limit = Math.min(previous.length, next.length)
  for (let size = limit; size > 8; size -= 1) {
    if (previous.endsWith(next.slice(0, size))) return size
  }
  return 0
}

/** The stored file: one timestamped line per chunk, and nothing else. */
export function formatTranscript(lines) {
  return `${lines.map((line) => `[${toStamp(line.t)}] ${line.text}`).join('\n')}\n`
}

/** The stored file, read back. A line with no stamp belongs to the one above. */
export function parseTranscript(text) {
  const lines = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const match = /^\[(\d{2}:\d{2}:\d{2})\]\s?(.*)$/.exec(raw.trim())
    if (match) lines.push({ t: toSeconds(match[1]), text: match[2].trim() })
    else if (raw.trim() && lines.length > 0) {
      lines[lines.length - 1].text = `${lines[lines.length - 1].text} ${raw.trim()}`
    }
  }
  return lines
}

/** Accents off, case off — a French corpus searched from a French keyboard. */
export const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/**
 * Where a subject was talked about.
 *
 * Scored rather than filtered: a query of several words rarely lands whole in
 * one sentence, so a passage is measured over a SLIDING WINDOW of lines and
 * the ones covering the most of the query win. Nothing here is a
 * recommendation — it says where the words are, and what it is worth is the
 * agent's judgement, not a number this file invented.
 */
export function search(lines, query, { limit = 8, window = 3 } = {}) {
  const terms = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 2)
  if (terms.length === 0 || lines.length === 0) return []

  const folded = lines.map((line) => fold(line.text))
  const hits = []
  for (let index = 0; index < lines.length; index += 1) {
    const passage = folded.slice(index, index + window).join(' ')
    const matched = terms.filter((term) => passage.includes(term))
    if (matched.length === 0) continue
    hits.push({
      index,
      t: lines[index].t,
      score: matched.length + matched.length / terms.length,
      text: lines
        .slice(index, index + window)
        .map((line) => line.text)
        .join(' '),
    })
  }

  // Overlapping windows describe the same passage: keep the best of each run
  // rather than reporting one moment three times. Measured in LINES, not in
  // seconds — a window overlaps its neighbour by `window - 1` lines whatever
  // the clock says, and a corpus where a sentence lasts two minutes had four
  // near-identical extracts on screen to prove it.
  hits.sort((a, b) => b.score - a.score || a.index - b.index)
  const kept = []
  for (const hit of hits) {
    if (kept.some((other) => Math.abs(other.index - hit.index) < window)) continue
    kept.push(hit)
    if (kept.length >= limit) break
  }
  return kept.sort((a, b) => a.index - b.index).map(({ index: _line, ...hit }) => hit)
}
