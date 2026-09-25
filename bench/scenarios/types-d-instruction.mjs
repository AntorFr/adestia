/**
 * The instruction zone, once it stopped being one grid of identical cards.
 *
 * What no unit test can say about this change, and what each shot is for:
 *
 * - three groups stacked on one canvas. A heading, a line of explanation and
 *   a grid of cards, three times over — does that read as one screen, or as
 *   three strips fighting for the same space? The headings are small caps in
 *   a muted colour precisely so they separate without shouting, and nobody
 *   has looked at that yet.
 * - the description on a card. A skill's is a paragraph, not a label: the
 *   clamp is meant to give three lines and stop. A clamp that does not bite
 *   turns one card into a column and pushes the grid apart.
 * - the DELIVERED skills are here too, badge and all, and there are five of
 *   them against the two somebody wrote. Whether the ones that are yours are
 *   still findable in that crowd is a question for a picture.
 * - the dark, where a muted heading over a faint line over a raised card is
 *   three greys that can collapse into one.
 * - a phone, where the grid is one column and the groups become a long
 *   scroll: the headings are what makes that scroll navigable, or they are
 *   noise repeated every four cards.
 *
 * The engine is faked, as always here (`bench/README.md`). Everything on this
 * screen is real: the driver's declared zones, the files on disk, the
 * frontmatter parsed off them.
 */

/** Walks the shell the way a link would, and lets the router settle. */
async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(700)
}

const write = (bench, path, markdown) =>
  bench.api(`/api/instructions/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })

export default async function scenario(bench) {
  // ── One of each kind, through the real route ────────────────────────────
  // The standing brief: no frontmatter, read whole, every turn.
  await write(
    bench,
    'CLAUDE.md',
    '# Comment travailler ici\n\n' +
      '- Réponds en français, toujours.\n' +
      '- Les fiches vivent dans `pages/`, une par sujet.\n' +
      "- Avant d'écrire dans l'atelier, demande.\n",
  )

  // Two skills. The first has the one-line description everybody writes; the
  // second has the paragraph a real one grows into — which is what the
  // three-line clamp exists for.
  await write(
    bench,
    '.claude/skills/courses/SKILL.md',
    '---\nname: courses\ndescription: Comment tenir la liste de courses. À utiliser quand on parle de repas, de rayons ou de ce qui manque.\n---\n\n' +
      '# Courses\n\nUne ligne par article, groupée par rayon.\n',
  )
  await write(
    bench,
    '.claude/skills/factures/SKILL.md',
    '---\nname: factures\ndescription: Classer une facture reçue par mail — où elle va, comment elle est nommée, ce qu’on écrit dans son frontmatter, et ce qu’il faut vérifier avant de la ranger quand le montant ne correspond pas au devis. À lire avant toute écriture dans `compta/`, y compris pour une simple relecture.\n---\n\n' +
      '# Factures\n\nUne par mois, dans `compta/<année>/`.\n',
  )

  // And two subagents, which live as `<name>.md` and not as a SKILL.md — the
  // shape the driver declares, and the one the client used to get wrong.
  await write(
    bench,
    '.claude/agents/relecteur.md',
    '---\nname: relecteur\ndescription: Relit un diff et ne dit que ce qui casse. Ni style, ni goût.\n---\n\n' +
      '# Relecteur\n\nTu lis le diff, tu cherches ce qui casse.\n',
  )
  await write(
    bench,
    '.claude/agents/veilleur.md',
    '---\nname: veilleur\ndescription: Surveille les dépendances et signale ce qui a bougé.\n---\n\n' +
      '# Veilleur\n\nTu regardes ce qui a changé en amont.\n',
  )

  // ── The three groups, on one canvas ─────────────────────────────────────
  const page = await bench.open()
  await go(page, '/settings/instructions')
  await bench.shoot(page, '1-three-groups')

  // Tall, because the point of this change is what sits BELOW the fold: the
  // agents group is the third one down, behind the delivered skills.
  const tall = await bench.open({ height: 2400 })
  await go(tall, '/settings/instructions')
  await bench.shoot(tall, '2-three-groups-tall')

  const dark = await bench.open({ theme: 'dark', height: 2400 })
  await go(dark, '/settings/instructions')
  await bench.shoot(dark, '3-three-groups-dark')

  // The search, which now reads descriptions too: `diff` is a word that
  // appears in no filename here.
  await page.fill('.adestia-instructions__search', 'diff')
  await page.waitForTimeout(400)
  await bench.shoot(page, '4-search-across-groups')

  // One group left standing, and no heading over it: a lone heading would
  // repeat the screen's own title and say nothing.
  await page.fill('.adestia-instructions__search', 'facture')
  await page.waitForTimeout(400)
  await bench.shoot(page, '5-one-group-left')

  // ── One opened, which must still say WHEN it is read ────────────────────
  // Somebody arriving by a link never saw the card that would have told them.
  await go(page, '/settings/instructions/.claude/agents/relecteur.md')
  await bench.shoot(page, '6-agent-open')

  // A delivered one, which is the same screen minus a Save.
  await go(page, '/settings/instructions/.claude/skills/page-author/SKILL.md')
  await bench.shoot(page, '7-delivered-open')

  // ── A phone, where the groups become a long scroll ──────────────────────
  const phone = await bench.open({ width: 390, height: 1600 })
  await go(phone, '/settings/instructions')
  await phone.click('.adestia-ib[aria-label="Open apps"]')
  await phone.waitForTimeout(600)
  await bench.shoot(phone, '8-three-groups-phone')
}
