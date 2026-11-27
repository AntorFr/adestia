/**
 * Whether a path relative to a folder matches a plugin's `dataFiles` pattern
 * (AD-41). `*` stands for any run of characters inside ONE segment; every
 * other character is literal and the whole path must match.
 */
export function matchesDataFile(pattern: string, path: string): boolean {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*')
  return new RegExp(`^${source}$`).test(path)
}
