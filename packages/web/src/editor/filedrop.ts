/**
 * Dropping a file onto a page.
 *
 * The gesture people expect — drag a photo onto the project and let go — with
 * the writing left where writing belongs. The file goes up to the chat's
 * inbox, which sits OUTSIDE the workspace, and the composer is pre-filled with
 * a sentence naming the page it should be filed with. The agent moves it.
 *
 * Why not have the browser write it straight into the page's folder: that
 * would make the shell a general-purpose file writer behind a session cookie,
 * which is a categorically more dangerous thing than the page editor (whose
 * every write is validated against a closed vocabulary). It also skips the one
 * step worth keeping — somebody deciding this file belongs in the workspace at
 * all, under what name, next to which page.
 *
 * PRE-FILLED, NOT SENT, and that is the same position the scanner takes: the
 * drop says WHAT, the person says what it means. "Range-la mais renomme-la
 * avant.jpg" is a thought you have while the file is under the cursor, and a
 * gesture that sent immediately would take it away from you. One key sends it.
 */

/** Whether a drag is carrying files rather than text dragged inside the page. */
export function carriesFiles(transfer: { types?: readonly string[] | DOMStringList } | null): boolean {
  const types = transfer?.types
  if (!types) return false
  return Array.from(types as ArrayLike<string>).includes('Files')
}

/**
 * What lands in the composer.
 *
 * It names the page by BOTH its title and its path: the title is what the
 * person recognises in what they are about to send, and the path is what
 * removes any doubt for the agent when two pages are called "Notes".
 *
 * Where an attachment goes is deliberately not spelled out here — the folder
 * convention lives in the `page-author` contract the agent reads, and a
 * sentence repeating it would be a second copy to keep in step.
 */
export function fileDropMessage(
  page: { readonly title: string; readonly path: string },
  t: (key: string) => string = (key) => key,
): string {
  return t('File the attached files with the page “%title” (%path).')
    .replace('%title', page.title)
    .replace('%path', page.path)
}
