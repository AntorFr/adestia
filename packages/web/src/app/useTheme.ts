/**
 * The viewer's theme choice, kept per browser and applied over the skin's.
 */

import { useEffect, useState } from 'react'

export function useTheme(skinScheme: 'light' | 'dark' | undefined) {
  /**
   * The viewer's theme choice: '' follows the system (and the skin's own
   * `scheme`), 'light'/'dark' override both. Reapplied when the skin loads,
   * because the skin loader also writes `data-theme` and the LAST writer
   * wins — a person's explicit choice must be that writer.
   */
  const [themePref, setThemePref] = useState<string>(() => {
    try {
      return localStorage.getItem('adestia.theme') ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    try {
      if (themePref) localStorage.setItem('adestia.theme', themePref)
      else localStorage.removeItem('adestia.theme')
    } catch {
      /* a preference that cannot persist still applies to this visit */
    }
    if (themePref) document.documentElement.dataset['theme'] = themePref
    else if (!skinScheme) delete document.documentElement.dataset['theme']
  }, [themePref, skinScheme])

  return [themePref, setThemePref] as const
}
