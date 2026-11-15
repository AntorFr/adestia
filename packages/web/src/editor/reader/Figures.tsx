import { plain, type Node } from '../nodes.js'
/**
 * `:::figures` — numbers as tiles, read from the markdown list inside it.
 *
 * `- Avancement: 62 % — 8 lots sur 13` gives a label, a figure and a caption.
 * The list is walked rather than rendered, which is the whole point: the FILE
 * stays a list somebody can read and edit by hand, and the tiles are what the
 * shell makes of it. A line that does not split on a colon is kept as a
 * caption-less tile rather than dropped — the reader never eats what it does
 * not understand.
 */
export function Figures({ node }: { readonly node: Node }) {
  // `view` is a choice: `tiles` is the default and an unknown value reads as
  // it, so a hand-written page never draws nothing.
  const inline = node.attributes?.['view'] === 'inline'
  const tiles: { label: string; value: string; caption?: string }[] = []
  const walk = (kids: readonly Node[] | undefined) => {
    for (const kid of kids ?? []) {
      if (kid.type === 'listItem') {
        const text = plain(kid)
        const cut = text.indexOf(':')
        const label = cut === -1 ? '' : text.slice(0, cut).trim()
        const rest = (cut === -1 ? text : text.slice(cut + 1)).trim()
        const [value, ...tail] = rest.split(/\s+—\s+/)
        tiles.push({
          label,
          value: value ?? '',
          ...(tail.length > 0 ? { caption: tail.join(' — ') } : {}),
        })
        continue
      }
      walk(kid.children)
    }
  }
  walk(node.children)
  if (tiles.length === 0) return null
  if (inline) {
    return (
      <div className="adestia-figures adestia-figures--inline">
        {tiles.map((tile, index) => (
          <span className="adestia-figure adestia-figure--inline" key={`${tile.label}-${index}`}>
            <b className="adestia-figure__value">{tile.value}</b>
            <span className="adestia-figure__label">
              {tile.label}
              {tile.caption ? <em> · {tile.caption}</em> : null}
            </span>
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="adestia-figures">
      {tiles.map((tile, index) => (
        <div className="adestia-figure" key={`${tile.label}-${index}`}>
          <b className="adestia-figure__value">{tile.value}</b>
          {percent(tile.value) !== null && (
            <span
              className="adestia-figure__meter"
              role="meter"
              aria-label={tile.label || tile.value}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent(tile.value) ?? 0}
              aria-valuetext={tile.value}
            >
              <i style={{ width: `${percent(tile.value) ?? 0}%` }} />
            </span>
          )}
          <span className="adestia-figure__label">
            {tile.label}
            {tile.caption ? <em> · {tile.caption}</em> : null}
          </span>
        </div>
      ))}
    </div>
  )
}


/** A figure that is a percentage ("62 %") draws its bar; anything else does not. */
function percent(value: string): number | null {
  const found = /^(\d+(?:[.,]\d+)?)\s*%/.exec(value.trim())
  if (!found) return null
  const n = Number((found[1] ?? '').replace(',', '.'))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null
}
