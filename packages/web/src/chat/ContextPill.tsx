/**
 * The weight of the context the next message re-pays, as one small pill.
 */

/** Amber then red, as fractions of the window when one is known. */
const WARN_FRACTION = 0.35

const HOT_FRACTION = 0.7

/** Fallbacks when the driver cannot report a window (no contextBreakdown). */
const WARN_ABSOLUTE = 60_000

const HOT_ABSOLUTE = 120_000

export function contextLevel(tokens: number, windowSize?: number): 'calm' | 'warn' | 'hot' {
  const warn = windowSize ? windowSize * WARN_FRACTION : WARN_ABSOLUTE
  const hot = windowSize ? windowSize * HOT_FRACTION : HOT_ABSOLUTE
  if (tokens >= hot) return 'hot'
  if (tokens >= warn) return 'warn'
  return 'calm'
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0)}k`
}

export function ContextPill({
  tokens,
  windowSize,
  onClick,
}: {
  tokens: number
  windowSize?: number
  onClick?: () => void
}) {
  if (tokens <= 0) return null
  const level = contextLevel(tokens, windowSize)
  return (
    <button
      type="button"
      className={`adestia-pill adestia-pill--${level}`}
      onClick={onClick}
      title="Weight of the context your next message re-pays"
    >
      {formatTokens(tokens)}
    </button>
  )
}
