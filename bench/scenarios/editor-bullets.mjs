/**
 * A bulleted list, read then edited.
 *
 * The defect this exists for: the read view zeroes a list item's paragraph
 * margin (`.adestia-prose li > p`), the editor surface did not, so every
 * bullet carried the 1em that sits below an ordinary paragraph — a blank line
 * between each item, in edit mode only. Both postures render the same
 * markdown from the same file, so the two shots are meant to be compared:
 * only a browser can say the list has stopped double-spacing itself.
 */

const PATH = 'notes/liste.md'

const MARKDOWN = `---
title: Liste
---

# Liste

Une phrase avant, pour l'écart normal sous un paragraphe.

- Premier item
- Deuxième item
- Troisième item

1. Un
2. Deux
3. Trois

Une phrase après.
`

export default async function scenario(bench) {
  // A folder the shell owns, with its index: a page filed under nothing is
  // not a page the launcher can route to.
  await bench.api('/api/pages/notes/INDEX.md', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown: '---\ntitle: Notes\n---\n\n# Notes\n' }),
  })
  await bench.api(`/api/pages/${PATH}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown: MARKDOWN }),
  })

  const page = await bench.open({})
  await page.evaluate((target) => {
    window.location.hash = target
  }, `/page/${PATH}`)

  // The reference posture: this is the spacing the editor has to match.
  await page.waitForSelector('.adestia-reader li', { timeout: 10_000 })
  await bench.shoot(page, '1-read')

  // The gesture a person makes, rather than a state set by hand.
  await page.click('button[title="Modifier"]')
  // Milkdown is fetched alongside the page, so the surface exists before the
  // document is in it — wait for the list itself, not for the container.
  await page.waitForSelector('.adestia-editor__surface .milkdown li', { timeout: 15_000 })
  await page.waitForTimeout(400)
  await bench.shoot(page, '2-edit')

  const dark = await bench.open({ theme: 'dark' })
  await dark.evaluate((target) => {
    window.location.hash = target
  }, `/page/${PATH}`)
  await dark.waitForSelector('.adestia-reader li', { timeout: 10_000 })
  await dark.click('button[title="Modifier"]')
  await dark.waitForSelector('.adestia-editor__surface .milkdown li', { timeout: 15_000 })
  await dark.waitForTimeout(400)
  await bench.shoot(dark, '3-edit-dark')
}
