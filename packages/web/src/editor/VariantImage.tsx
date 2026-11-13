/**
 * The small drawings of a block's variants (`view` values), shared by the
 * settings window (E-6) and the gallery cards (E-34): one picture, two places.
 */

import type { ReactNode } from 'react'

/** A small drawing of a variant, in the current colour; a name it does not know is drawn as text instead. */
export function VariantImage({ name }: { readonly name: string }): ReactNode {
  const box = (children: ReactNode) => (
    <svg className="adestia-variant" viewBox="0 0 48 32" aria-hidden="true" focusable="false" fill="currentColor">
      {children}
    </svg>
  )
  const line = { opacity: 0.35 }
  switch (name) {
    case 'tiles':
      return box(
        <>
          <rect x="2" y="4" width="13" height="24" rx="2" {...line} />
          <rect x="17.5" y="4" width="13" height="24" rx="2" {...line} />
          <rect x="33" y="4" width="13" height="24" rx="2" {...line} />
          <rect x="5" y="9" width="7" height="5" rx="1" />
          <rect x="20.5" y="9" width="7" height="5" rx="1" />
          <rect x="36" y="9" width="7" height="5" rx="1" />
        </>,
      )
    case 'inline':
      return box(
        <>
          <rect x="2" y="13" width="9" height="6" rx="1" />
          <rect x="14" y="13" width="9" height="6" rx="1" opacity="0.5" />
          <rect x="26" y="13" width="9" height="6" rx="1" />
          <rect x="38" y="13" width="8" height="6" rx="1" opacity="0.5" />
        </>,
      )
    case 'rows':
      return box(
        <>
          <rect x="2" y="5" width="44" height="5" rx="1.5" />
          <rect x="2" y="13.5" width="44" height="5" rx="1.5" opacity="0.5" />
          <rect x="2" y="22" width="44" height="5" rx="1.5" />
        </>,
      )
    case 'cards':
      return box(
        <>
          <rect x="2" y="3" width="20" height="12" rx="2" {...line} />
          <rect x="26" y="3" width="20" height="12" rx="2" {...line} />
          <rect x="2" y="18" width="20" height="12" rx="2" {...line} />
          <rect x="26" y="18" width="20" height="12" rx="2" {...line} />
          <rect x="5" y="6" width="10" height="3" rx="1" />
          <rect x="29" y="6" width="10" height="3" rx="1" />
          <rect x="5" y="21" width="10" height="3" rx="1" />
          <rect x="29" y="21" width="10" height="3" rx="1" />
        </>,
      )
    case 'chips':
      return box(
        <>
          <rect x="2" y="6" width="14" height="7" rx="3.5" />
          <rect x="19" y="6" width="12" height="7" rx="3.5" opacity="0.5" />
          <rect x="34" y="6" width="12" height="7" rx="3.5" />
          <rect x="2" y="19" width="12" height="7" rx="3.5" opacity="0.5" />
          <rect x="17" y="19" width="16" height="7" rx="3.5" />
        </>,
      )
    default:
      return null
  }
}
