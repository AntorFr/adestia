/**
 * Settings, split in two: a menu behind the cog, an app on the canvas.
 *
 * What no unit test can say about this change, and what each shot is for:
 *
 * - the cog menu is a floating panel over whatever you were reading. Does it
 *   fit? Does the arming flow inside it fit? Does it survive the dark, where
 *   a panel and the canvas under it are two shades of nearly the same thing?
 * - the settings app draws TILES now, and a mosaic of two on a 940px canvas
 *   is a shape nobody has looked at.
 * - the MCP declaration and the instruction body are both a full-height
 *   monospaced box on a screen that already carries a head and a back link.
 *   Whether that adds up to one screen or to three stacked strips is a
 *   question for a picture.
 * - a phone, for both, because the menu is anchored to the right edge of a
 *   header that is much narrower there.
 *
 * The engine is faked, as always here (`bench/README.md`): `/api/mcp/status`
 * legitimately 404s with no CLI in the image, so the health chips are absent
 * on purpose. Everything else — the wiring, the store, the writes — is real.
 */

/** Walks the shell the way a link would, and lets the router settle. */
async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(700)
}

export default async function scenario(bench) {
  // ── Seed, through the real routes ────────────────────────────────────────
  // Two servers the shell itself wrote, so the screen has both an editable
  // tile and something to show behind one.
  await bench.api('/api/mcp/servers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'home-assistant',
      url: 'https://ha.maison.example/mcp',
      headers: { Authorization: 'Bearer un-jeton-qui-ne-sort-jamais' },
    }),
  })
  await bench.api('/api/mcp/servers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'notion', command: 'npx', args: ['-y', 'notion-mcp'] }),
  })

  // And two instructions, so the card grid has something to be a grid of.
  await bench.api('/api/instructions/CLAUDE.md', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      markdown:
        '# Comment travailler ici\n\n' +
        '- Réponds en français, toujours.\n' +
        '- Les fiches vivent dans `pages/`, une par sujet.\n' +
        "- Avant d'écrire dans l'atelier, demande.\n",
    }),
  })
  await bench.api('/api/instructions/.claude/skills/courses/SKILL.md', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      markdown:
        '---\nname: courses\ndescription: Comment tenir la liste de courses\n---\n\n' +
        '# Courses\n\nUne ligne par article, groupée par rayon.\n',
    }),
  })

  // ── The cog, which is the half that must not be a navigation ────────────
  for (const theme of ['light', 'dark']) {
    const page = await bench.open({ theme })
    await page.click('.adestia-ib[aria-label="Réglages"]')
    await page.waitForTimeout(500)
    // The whole menu, over the canvas it did NOT take you away from.
    await bench.shoot(page, `1-cog-menu-${theme}`)
  }

  // ── The app, which is the half that needed a canvas ─────────────────────
  const page = await bench.open()
  await go(page, '/settings')
  await bench.shoot(page, '2-settings-mosaic')

  await go(page, '/settings/mcp')
  await bench.shoot(page, '3-mcp-tiles')

  await go(page, '/settings/mcp/home-assistant')
  await bench.shoot(page, '4-mcp-declaration')

  await go(page, '/settings/instructions')
  await bench.shoot(page, '5-instruction-cards')

  // The search field, doing the thing the column of names could not.
  await page.fill('.adestia-instructions__search', 'courses')
  await page.waitForTimeout(400)
  await bench.shoot(page, '6-instruction-search')

  await go(page, '/settings/instructions/CLAUDE.md')
  await bench.shoot(page, '7-instruction-open')

  // Dark, where a full-height monospaced box on a raised surface is the shape
  // most likely to disappear into the canvas behind it.
  const dark = await bench.open({ theme: 'dark' })
  await go(dark, '/settings/instructions/CLAUDE.md')
  await bench.shoot(dark, '8-instruction-open-dark')

  // ── A phone, where the menu is anchored to a much narrower header ───────
  // The canvas has to be SLID IN first: on a phone the shell opens on the
  // chat, and the header the cog lives in is off screen entirely — setting
  // the hash alone leaves you looking at the thread.
  const phone = await bench.open({ width: 390, height: 844 })
  await go(phone, '/settings')
  await phone.click('.adestia-ib[aria-label="Open apps"]')
  await phone.waitForTimeout(600)
  await bench.shoot(phone, '9-settings-mosaic-phone')

  await phone.click('.adestia-ib[aria-label="Réglages"]')
  await phone.waitForTimeout(500)
  await bench.shoot(phone, '10-cog-menu-phone')

  await go(phone, '/settings/mcp')
  await bench.shoot(phone, '11-mcp-tiles-phone')
}
