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
  return (
    <div className="adestia-figures">
      {tiles.map((tile, index) => (
        <div className="adestia-figure" key={`${tile.label}-${index}`}>
          <b className="adestia-figure__value">{tile.value}</b>
          <span className="adestia-figure__label">
            {tile.label}
            {tile.caption ? <em> · {tile.caption}</em> : null}
          </span>
        </div>
      ))}
    </div>
  )
}

