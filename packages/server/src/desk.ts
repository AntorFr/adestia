import type { Driver } from '@antorfr/adestia-drivers'

import type { AdestiaConfig } from './config.js'
import { frameShell } from './introduction.js'
import { TurnLimiter } from './turn-limiter.js'
import { TurnDesk } from './turns.js'

/** The desk, with the shell's preamble and the ceremony-link rule. */
export function buildDesk(driver: Driver, config: AdestiaConfig) {
  const limiter = new TurnLimiter(config.maxConcurrentTurns)
  /**
   * The shell's own preamble, decided once and applied on both spawn paths.
   *
   * Only where the engine has somewhere to READ the contract from: a driver
   * declaring no skills directory gets none delivered, and an anchor citing a
   * file that was never written is worse than saying nothing — it invites
   * exactly the invention it exists to stop.
   */
  const introduce = driver.skillsPath?.() ? frameShell : undefined
  // The desk owns chat turns; the clock's and the MCP delegation's loops
  // stay as they are and share the same limiter, so the cap keeps one meaning.
  // A ceremony link becomes a card only on an origin the operator named.
  const signatureOrigins = new Set(config.signatures.origins)
  const signs = (url: string): boolean => {
    try {
      return signatureOrigins.has(new URL(url).origin)
    } catch {
      return false
    }
  }
  return { desk: new TurnDesk(driver, limiter, introduce, signs), limiter }
}
