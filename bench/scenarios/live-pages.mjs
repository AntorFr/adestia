/**
 * A page born while the screen was already watching.
 *
 * The defect this exists for: the index was a snapshot taken at boot, so a
 * page the agent created mid-chat appeared everywhere except on the screen of
 * the person who asked for it — until they reloaded by hand. The change feed
 * (`/api/events`) is supposed to close that gap, and only a browser can say
 * it actually does: the unit tests prove the feed speaks and the shell
 * listens, not that a tile lands on the canvas of a page nobody reloaded.
 *
 * The pages are written through the pages API rather than by hand into a
 * volume the browser container does not mount; to the watcher both are the
 * same thing — a file landing on disk outside the shell's doing.
 */

const put = (bench, path, markdown) =>
  bench.api(`/api/pages/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })

export default async function scenario(bench) {
  const page = await bench.open({})
  await bench.shoot(page, '1-home-before')

  await put(bench, 'recettes/INDEX.md', '---\ntitle: Recettes\n---\n\n# Recettes\n')
  await put(
    bench,
    'recettes/tarte-aux-pommes.md',
    '---\ntitle: Tarte aux pommes\n---\n\n# Tarte aux pommes\n\nNée pendant que l’écran regardait.\n',
  )

  // No reload, no navigation: the tile must arrive on its own. The selector
  // IS the assertion — the scenario fails loudly if the feed stays silent.
  await page.waitForSelector('text=Recettes', { timeout: 8000 })
  await bench.shoot(page, '2-tile-arrived-without-reload')
}
