/**
 * A text the agent set apart for the reader to carry away (AD-copie-1).
 *
 * Drawn from a ```copy fence of a settled reply. The box holds the text only;
 * the button writes exactly `value` — no fence, no trailing newline — to the
 * clipboard. While the reply still streams (`live`) or when there is nothing
 * to copy, the frame is drawn without a button: a half-written email must not
 * be copyable as if it were whole.
 */

import { useEffect, useRef, useState } from 'react'

import { Button } from '../app/ui/Button.js'

type State = 'ready' | 'copied' | 'failed'

const COPIED_MS = 2000
const FAILED_MS = 3000

/** The pre-clipboard-API path: a hidden textarea and `execCommand`. */
function legacyCopy(value: string): boolean {
  const area = document.createElement('textarea')
  area.value = value
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  try {
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

async function writeText(value: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(value)
      return true
    } catch {
      return false
    }
  }
  return legacyCopy(value)
}

export function CopyBox({
  value,
  live = false,
  t = (key) => key,
}: {
  value: string
  live?: boolean
  t?: (key: string) => string
}) {
  const [state, setState] = useState<State>('ready')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const press = async () => {
    clearTimeout(timer.current)
    const ok = await writeText(value)
    setState(ok ? 'copied' : 'failed')
    timer.current = setTimeout(() => setState('ready'), ok ? COPIED_MS : FAILED_MS)
  }

  const label = t(state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy')
  const icon = state === 'copied' ? 'check' : state === 'failed' ? 'x' : 'copy'

  return (
    <div className="adestia-copybox" aria-live="polite">
      <div className="adestia-copybox__text">{value}</div>
      {!live && value !== '' && (
        <Button icon={icon} small variant="ghost" aria-label={label} title={label} onClick={() => void press()} />
      )}
    </div>
  )
}
