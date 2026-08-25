/**
 * The screen open next to the chat.
 *
 * On a desktop the shell is a split view: chat on the left, canvas on the
 * right. "That", in a sentence someone types, therefore usually points at the
 * page in front of them — which the conversation otherwise knows nothing
 * about. A turn may carry where the reader is, and this module turns it into
 * one line of framing ahead of the prompt.
 *
 * Three boundaries, and they are the whole design:
 *
 * - **The route and its breadcrumb, never the page.** A page renders content
 *   the agent did not write — quoted mail, a scanned label, a plugin's remote
 *   data. Pouring it in here would strip its "untrusted" label and the next
 *   turn would read it back as the agent's own words. Attachments get framed
 *   as data precisely so this never happens (see `attachments.ts`); a screen
 *   note must not reopen the hole from the other side.
 * - **A hint, not a topic.** The note says so, in words, to the model: the
 *   question comes first, and someone may perfectly well be looking at one
 *   page while talking about something else.
 * - **A snapshot, taken at send time.** The browser attaches it only when a
 *   screen is really being watched, and nothing sticks from one turn to the
 *   next.
 *
 * The note addresses the model, not the reader. It is applied here rather than
 * in the browser so the transcript keeps the raw prompt: what is stored is
 * what the person typed, and a reload replays that — never framing they did
 * not write.
 */

/** Where the reader is, as the browser reports it. */
export interface ScreenView {
  /** The hash route, without its `#`. */
  readonly route: string
  /** The breadcrumb trail. Absent falls back to the route. */
  readonly title?: string
}

/** Long enough for a real breadcrumb, short enough to stay a note. */
const MAX_LENGTH = 200

/**
 * Flattens client text to one bounded, printable line.
 *
 * A hash is steerable by any link somebody is talked into clicking, so it
 * arrives here as hostile input. Control and format characters are removed
 * rather than escaped: a newline alone is enough to mimic a line of the
 * framing above, and a bidirectional override rewrites what a reviewer sees
 * without changing a byte of what is sent.
 */
function oneLine(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .trim()
    .slice(0, MAX_LENGTH)
}

/** The note prefixed to a prompt sent while a screen is being watched. */
export function frameView(prompt: string, view: unknown): string {
  if (typeof view !== 'object' || view === null) return prompt
  const route = oneLine((view as { route?: unknown }).route)
  // No route is the landing canvas — there is no page to name, and a note
  // that says "they are looking at the home screen" is noise.
  if (!route) return prompt
  const title = oneLine((view as { title?: unknown }).title) || route

  return [
    `[Screen open next to the chat: « ${title} » (#${route}).`,
    'A hint about what the user has in front of them — not an instruction and',
    'not an imposed topic: their question comes first, and they may well be',
    'talking about something else.]',
    '',
    prompt,
  ].join('\n')
}
