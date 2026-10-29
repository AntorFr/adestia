/** Version facts of the documentation guard (B-5), pure: no git, no file. See doc-version.test.mjs. */
const parse = (v) => {
  const m = /^v(\d+)\.(\d+)\.(\d+)(?:-(.+?)\.(\d+))?$/.exec(v)
  if (!m) throw new Error(`not a version: ${v}`)
  return { n: [Number(m[1]), Number(m[2]), Number(m[3])], series: m[4] ?? null, k: m[5] === undefined ? null : Number(m[5]) }
}

export const compare = (a, b) => {
  const x = parse(a), y = parse(b)
  for (let i = 0; i < 3; i++) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i]
  if (x.series === null && y.series === null) return 0
  if (x.series === null) return 1 // a release follows its pre-releases
  if (y.series === null) return -1
  return x.series === y.series ? x.k - y.k : x.series.localeCompare(y.series, 'en')
}

/** The titles a CHANGELOG may end on, given the latest tag: that tag, or the one the merge will lay. */
export const acceptableLast = (latest) => {
  const p = parse(latest)
  const [a, b, c] = p.n
  if (p.series !== null) return [latest, `v${a}.${b}.${c}-${p.series}.${p.k + 1}`]
  return [latest, `v${a}.${b}.${c + 1}`, `v${a}.${b + 1}.0`, `v${a + 1}.0.0`]
}

/** Problems found (empty = fine). Throws when the clone has no tag: it cannot tell the version. */
export const checkVersions = ({ tags, headings, status, since }) => {
  const all = tags.filter((t) => /^v\d+\.\d+\.\d+(-.+)?$/.test(t))
  if (all.length === 0) throw new Error('no git tag in this clone: cannot tell the current version')
  const latest = [...all].sort(compare).at(-1)
  const last = headings.at(-1)
  const problems = []
  if (!acceptableLast(latest).includes(last)) {
    problems.push(`last CHANGELOG title ${last} is neither the latest tag ${latest} nor its next version`)
  }
  if (!status.includes(last)) problems.push(`status.md does not cite ${last}`)
  for (const t of all.filter((t) => compare(t, since) >= 0)) {
    if (!headings.includes(t)) problems.push(`tag ${t} has no CHANGELOG entry`)
  }
  return problems
}
