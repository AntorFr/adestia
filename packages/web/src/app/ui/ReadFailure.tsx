import { EmptyState } from './EmptyState.js'
import { Failure } from './Failure.js'

/**
 * A failed read, said where the data would have been. Retry is offered only
 * when trying again can change the outcome: the server did not answer (0) or
 * failed (5xx). A 404 or 401/403 keeps its message and no button (AD-24).
 */
export function ReadFailure({
  message,
  httpStatus,
  onRetry,
  t = (key) => key,
}: {
  readonly message: string
  readonly httpStatus: number | undefined
  readonly onRetry: () => void
  readonly t?: (key: string) => string
}) {
  const refused = httpStatus === 404 || httpStatus === 401 || httpStatus === 403
  return refused
    ? <EmptyState icon="circle-alert" text={message} />
    : <Failure message={message} onRetry={onRetry} t={t} />
}
