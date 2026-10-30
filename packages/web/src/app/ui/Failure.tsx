import { Button } from './Button.js'
import { EmptyState } from './EmptyState.js'

/** Retry replaces this whole block with Loading at the request's call site (AD-24). */
export function Failure({
  message,
  onRetry,
  t = (key) => key,
}: {
  readonly message: string
  readonly onRetry: () => void
  readonly t?: (key: string) => string
}) {
  return (
    <EmptyState
      icon="circle-alert"
      text={message}
      action={<Button icon="rotate-ccw" onClick={onRetry}>{t('Retry')}</Button>}
    />
  )
}
