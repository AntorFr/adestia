/**
 * The model the instance will answer with, chosen in the chat's header.
 */

/**
 * One model the driver offers.
 *
 * Declared here rather than imported from the driver package: the browser
 * bundle has no business depending on server code, and this is the shape of a
 * JSON payload, not of a driver.
 */
export interface ModelInfo {
  readonly id: string
  readonly label?: string
}

/**
 * The model this instance will answer with.
 *
 * It lives in the chat's HEADER rather than in the composer, and the move is
 * the point: which engine is answering is a property of the CONVERSATION, not
 * of the message being typed. Down in the composer it competed for width with
 * the field — the one control that must never shrink — and on a phone it was
 * a truncated `claude-son…` wedged between the clip and the send button.
 * Up top it sits next to the name of the thing that is about to speak, which
 * is where every other chat surface puts it and where a reader looks for it.
 *
 * Rendered only when the driver enumerates models, so an instance whose CLI
 * has no catalogue shows no empty control. AUTO is first and is the default:
 * it sends no model at all and lets the CLI choose, which is a real answer
 * rather than a placeholder — most turns do not care, and pinning one
 * silently would override a default the operator may have set outside Adestia.
 */
export function ModelPicker({
  models,
  model,
  onModel,
  t = (key) => key,
}: {
  /** What this driver offers. Empty means it does not enumerate models. */
  models?: readonly ModelInfo[]
  /** The chosen id, or `''` for the CLI's own default. */
  model?: string
  onModel?: (model: string) => void
  t?: (key: string) => string
}) {
  if (models === undefined || models.length === 0) return null
  return (
    <select
      className="adestia-model"
      value={model ?? ''}
      onChange={(event) => onModel?.(event.target.value)}
      aria-label={t('Model')}
      title={t('Model')}
    >
      <option value="">{t('Auto')}</option>
      {models.map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.label ?? entry.id}
        </option>
      ))}
    </select>
  )
}
