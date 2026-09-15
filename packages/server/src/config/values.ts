/**
 * Reading one value out of a configuration block: the shapes a setting may
 * take, and the sentence an operator reads when it does not.
 */

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function stringList(value: unknown, field: string, issues: string[]): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    issues.push(`${field} must be a list of strings`)
    return []
  }
  return value as readonly string[]
}

export function requireString(
  raw: Record<string, unknown>,
  key: string,
  field: string,
  issues: string[],
): string {
  const value = raw[key]
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(`${field} is required`)
    return ''
  }
  return value
}

/**
 * `workspace.stores`, or the single store an instance without one still has.
 *
 * Absent, it yields one store built from `workspace.pages` — so the
 * composition is backwards-compatible BY CONSTRUCTION, not by remembering to
 * be. Present, it wins, and `pages` is reported as ignored rather than
 * quietly obeyed or quietly dropped: an operator who left both in the file is
 * owed the sentence saying which one the instance is actually reading.
 *
 * Shape is checked here and MEANING in `resolveStores` — a typo is a
 * configuration error the operator fixes, while "two stores claim to be the
 * default" is a contradiction between declarations that only makes sense once
 * they are all read.
 */
/**
 * Reads `workspace.umask` — a string of octal digits, quoted.
 *
 * The quoting is not a style preference and it gets its own message. YAML
 * reads an unquoted `002` as the DECIMAL number two, which is a valid umask
 * (`0002`) and therefore would be accepted in silence while meaning something
 * the author never wrote — `012` would arrive as twelve, that is `0014`. A
 * number is refused here and told exactly what to type, because the failure it
 * causes is invisible: files come out with permissions nobody chose.
 */
export function parseUmask(raw: unknown, issues: string[]): number | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'number') {
    issues.push(
      `workspace.umask must be QUOTED ("002"): YAML reads an unquoted 002 as the decimal number ${raw}`,
    )
    return undefined
  }
  if (typeof raw !== 'string' || !/^[0-7]{3,4}$/.test(raw)) {
    issues.push('workspace.umask must be three or four octal digits as a string, e.g. "002"')
    return undefined
  }
  return Number.parseInt(raw, 8)
}
