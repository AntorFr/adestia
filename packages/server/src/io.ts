/**
 * A ceiling on the file-system calls the server has in flight at once.
 *
 * Reading a workspace concurrently is what hides the round trip of a network
 * or 9p mount, but "every file at once" is a file-descriptor count that grows
 * with the workspace — `EMFILE` on a large one. Only LEAF calls (a `stat`, a
 * `readFile`, a `readdir`) go through the gate, never a function that awaits
 * another gated call, so a full gate can always drain: no call waits on a
 * waiter.
 */

const LIMIT = 32

let running = 0
const waiting: (() => void)[] = []

export async function gated<T>(task: () => Promise<T>): Promise<T> {
  if (running >= LIMIT) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  try {
    return await task()
  } finally {
    running--
    waiting.shift()?.()
  }
}

/** Calls in flight right now — for the test that proves the ceiling. */
export const inFlight = (): number => running
