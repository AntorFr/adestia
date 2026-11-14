/**
 * One patience for every wait of the browser suites. A delay written in a Playwright wait
 * (`waitForSelector`, `click`, `expect.poll`, `waitFor`, `timeout:`) or in a test's own
 * time limit goes through `patience(ms)`, which multiplies it by `ADESTIA_PATIENCE`
 * (an integer, 1 when unset): `scripts/suite-attestee.sh` sets 4 on the vitest step, where
 * the pod runs a dozen browsers at once and a fixed 5 s or 20 s is a measure of the load.
 */

const read = (): number => {
  const n = Number(process.env.ADESTIA_PATIENCE)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

/** The factor itself, for a loop that counts its own tries. */
export const PATIENCE = read()

/** `ms` scaled by the patience factor. */
export const patience = (ms: number): number => ms * PATIENCE
