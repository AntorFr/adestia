/**
 * The basket, and the message it becomes.
 *
 * Kept apart from the camera because this is the part with rules, and rules
 * deserve tests that do not need a webcam.
 *
 * The rule that shapes everything here: **this plugin decides nothing.** It
 * accumulates codes and drops them in the composer, where what the person
 * typed — "add these to the shopping list", "how much protein is in this" —
 * remains the only instruction. A reader that sent a message on every beep
 * would be making that decision for them, badly.
 */

/** Formats worth trying. Anything else is noise from a shelf edge. */
export const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code']

export function createBasket() {
  return { codes: [], rejected: new Set() }
}

/**
 * Adds a code, unless it is already there or was thrown out.
 *
 * @returns whether the basket changed — so the caller can beep exactly once
 *   per new code rather than on every frame that still sees the same label.
 */
export function addCode(basket, raw) {
  const code = String(raw ?? '').trim()
  if (code === '' || basket.rejected.has(code)) return false
  if (basket.codes.includes(code)) return false
  basket.codes.push(code)
  return true
}

/**
 * Removes a code AND remembers the refusal.
 *
 * Without the memory, the camera re-reads the label a tenth of a second later
 * and puts it straight back: one wrong code would condemn the basket, and the
 * only way out would be closing the scanner.
 */
export function dropCode(basket, code) {
  basket.codes = basket.codes.filter((item) => item !== code)
  basket.rejected.add(code)
}

/**
 * What lands in the composer.
 *
 * Appended to whatever is already typed, never replacing it: the sentence in
 * the field is the instruction, and the codes are its object.
 */
export function composeMessage(existing, codes) {
  if (codes.length === 0) return existing
  const list = codes.join(' ')
  const current = String(existing ?? '').trim()
  return current === '' ? list : `${current} ${list}`
}
