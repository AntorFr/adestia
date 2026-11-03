import { Icon } from '../Icon.js'

/** The shared wait row, including the live announcement and reduced-motion icon. */
export function Loading({ t = (key) => key }: { readonly t?: (key: string) => string }) {
  return (
    <div className="adestia-loading" role="status">
      <Icon name="loader-circle" />
      {t('Loading…')}
    </div>
  )
}
