/**
 * The question the engine raised, and the three ways to answer it.
 */

import type { PendingAsk } from './stream.js'

/**
 * The question the engine raised, and the three ways to answer it.
 *
 * The sentence is the ENGINE's own (`title`), shown whole. A predecessor
 * rendered a target truncated to 78 characters — a string built for a trace
 * line, reused for consent — so a long command was approved unseen. Consent to
 * an elided command is not consent.
 *
 * "Always" is the answer that makes asking bearable, and it is the ENGINE's
 * memory, not Adestia's: the CLI writes the rule into its own file in the
 * workspace and reads it back on every later turn. So the durable allowlist
 * is a file a person can open, read and edit — which is also the honest
 * answer to "what is my agent allowed to do".
 *
 * It is HIDDEN, not disabled, when the engine offered no rule to remember: a
 * button that promises silence and does not deliver it is worse than one more
 * question.
 */
export function AskPrompt({
  ask,
  onAnswer,
  t = (key) => key,
}: {
  ask: PendingAsk
  onAnswer: (id: string, answer: 'once' | 'always' | 'deny') => void
  t?: (key: string) => string
}) {
  return (
    <div className="adestia-ask" role="alertdialog" aria-label={t('Permission required')}>
      <p className="adestia-ask__text">{ask.title}</p>
      {ask.reason && <p className="adestia-ask__reason">{ask.reason}</p>}
      {/* Said out loud rather than left as a missing button. The engine
          declines to propose a rule for a command its own parser cannot cut
          up — a `cd x && cat <<EOF` among them — so there is nothing durable
          to offer here, and somebody clicking through the same question for
          the tenth time deserves to know why rather than hunt for a button
          that was never there. */}
      {!ask.remembering && (
        <p className="adestia-ask__reason">
          {t('No lasting rule for this one — the engine proposed none.')}
        </p>
      )}
      <div className="adestia-ask__actions">
        <button type="button" onClick={() => onAnswer(ask.id, 'deny')}>
          {t('Refuse')}
        </button>
        <button type="button" onClick={() => onAnswer(ask.id, 'once')}>
          {t('Just this once')}
        </button>
        {ask.remembering && (
          <button
            type="button"
            className="adestia-ask__always"
            onClick={() => onAnswer(ask.id, 'always')}
          >
            {t('Always')}
          </button>
        )}
      </div>
    </div>
  )
}
