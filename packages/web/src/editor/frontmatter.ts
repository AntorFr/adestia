/**
 * Reading and writing ONE frontmatter field, without touching the rest.
 *
 * Surgery rather than a re-serialisation, for the reason the plugins that
 * already do this give: a page's frontmatter carries conventions the editor
 * does not model, and rewriting the block would reformat keys it was only
 * asked to leave alone — churning a diff on every save of a file somebody
 * merely retitled.
 *
 * It lives in the shell rather than in a plugin because the title is not a
 * plugin's idea: every page has one, and a title that can only be changed by
 * the agent is a title the person reading the page cannot fix.
 */

const BLOCK = /^---\n([\s\S]*?)\n---/

/** The value of `key`, or `''` when the page has none. Never throws. */
export function readField(markdown: string, key: string): string {
  const block = BLOCK.exec(markdown)?.[1]
  if (!block) return ''
  const line = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(block)?.[1]
  return (line ?? '').trim().replace(/^["']|["']$/g, '')
}

/**
 * The same markdown with `key` set — added if absent, REMOVED if emptied.
 *
 * Emptied means absent rather than `title: ""`: a page whose title is the
 * empty string prints as a blank heading everywhere something draws it, which
 * is worse than a page that has no title and says so.
 *
 * A page with no frontmatter GAINS one. That is the case a new document hits,
 * and refusing it would mean the field silently does nothing on exactly the
 * page somebody is most likely to be naming.
 */
export function writeField(markdown: string, key: string, value: string): string {
  const clean = value.trim()
  const block = BLOCK.exec(markdown)

  if (!block) {
    if (clean === '') return markdown
    return `---\n${key}: ${clean}\n---\n\n${markdown.replace(/^\n+/, '')}`
  }

  const front = block[1] ?? ''
  const line = new RegExp(`^${key}:.*$`, 'm')
  /*
   * Whether the field is THERE is asked of the regex, never inferred from the
   * text changing. Renaming a page to the name it already has rewrites the
   * line to the identical string, and reading that as "no match" is what made
   * the editor append a SECOND `title:` on every save of an unchanged title.
   */
  const present = line.test(front)

  let next: string
  if (clean === '') {
    next = present ? front.replace(new RegExp(`\\n?^${key}:.*$`, 'm'), '') : front
  } else {
    // A function replacer, because the VALUE is somebody's prose: `$&` in a
    // title is two characters, not a back-reference to the line it replaces.
    next = present ? front.replace(line, () => `${key}: ${clean}`) : `${front}\n${key}: ${clean}`
  }
  if (next === front) return markdown

  // Spliced by position rather than by `String.replace`, for the same reason:
  // the frontmatter is arbitrary text and must not be read as a pattern, nor
  // matched somewhere else in a document that happens to repeat it.
  const at = (block.index ?? 0) + 4
  return markdown.slice(0, at) + next + markdown.slice(at + front.length)
}
