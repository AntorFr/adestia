/**
 * The turn events, as the browser sees them.
 *
 * They are the engine's own: the server relays each driver event as one SSE
 * frame, and the browser reduces the same union the driver contract declares.
 * Imported as a TYPE — erased at compile time — so the shell's bundle carries
 * no engine code; declared once, so nothing can drift. A second copy used to
 * live here, pinned to the first by a test.
 */

export type { TurnEvent, TurnUsage } from '@antorfr/adestia-drivers'
