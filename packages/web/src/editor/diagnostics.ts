import type { Diagnostic } from '@antorfr/adestia-content'

/** Also accepts legacy and plugin diagnostics that carry only their message. */
export type DiagnosticMessage = Pick<Diagnostic, 'message' | 'code' | 'args'>

const TEMPLATES: Readonly<Record<string, string>> = {
  'unknown-block': 'Unknown block ":::%block". The vocabulary is closed; extending it is a coded change.',
  'no-content': 'Block ":::%block" takes no content — its attributes are its whole meaning.',
  'no-content-disputed': 'Block ":::%block" holds a body only some of its definitions accept — it is kept, and drawn only where its definition takes one.',
  'needs-content': 'Block ":::%block" needs content.',
  'needs-content-disputed': 'Block ":::%block" is empty, which only some of its definitions allow.',
  'attribute-required': 'Block ":::%block" requires the attribute "%key".',
  'attribute-value': '":::%block" attribute "%key" is "%value"; accepted: %accepted.',
  'attribute-unknown': '":::%block" has no attribute "%key"; it will be ignored.',
}

/** Translate the sentence first, then insert author data once, without interpreting it. */
export function diagnosticMessage(diagnostic: DiagnosticMessage, t: (key: string) => string): string {
  const { code, args, message } = diagnostic
  if (!code || !Object.hasOwn(TEMPLATES, code)) return message
  const template = TEMPLATES[code]!
  const required = template.match(/%(?:block|key|value|accepted)\b/g) ?? []
  if (required.some((key) => typeof args?.[key.slice(1)] !== 'string')) return message
  return t(template).replace(/%(block|key|value|accepted)\b/g, (placeholder, key: string) => args?.[key] ?? placeholder)
}
