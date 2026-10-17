import { toneOf } from '@antorfr/adestia-content'
/** Frontmatter chips — the same ones the card and the editor wear. */
export function Meta({ yaml }: { readonly yaml: string }) {
  const fields = new Map<string, string>()
  for (const line of yaml.split('\n')) {
    const cut = line.indexOf(':')
    if (cut < 1 || /^\s/.test(line)) continue
    fields.set(line.slice(0, cut).trim(), line.slice(cut + 1).trim().replace(/^["']|["']$/g, ''))
  }

  const status = fields.get('status') ?? fields.get('statut')
  const kinds = ['type', 'cat', 'role'].map((key) => fields.get(key)).filter(Boolean) as string[]
  const tags = (fields.get('tags') ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  if (!status && kinds.length === 0 && tags.length === 0) return null

  return (
    <div className="adestia-editor__meta">
      {status && <span className={`adestia-stat adestia-stat--${toneOf(status)}`}>{status}</span>}
      {kinds.map((kind) => (
        <span key={kind} className="adestia-tag">
          {kind}
        </span>
      ))}
      {tags.map((tag) => (
        <span key={tag} className="adestia-tag">
          #{tag}
        </span>
      ))}
    </div>
  )
}

