/**
 * The phone, on a screen that must never zoom.
 *
 * iOS zooms the page when a field whose text is under 16px takes focus, and
 * it never zooms back out. The shell being a fixed `100dvh` that hides its
 * overflow, the canvas header and its switch back to the chat then sit
 * outside the visual viewport with no gesture left to reach them: the phone
 * is stranded on a screen with no way off it.
 *
 * The floor that prevents it fires on `(pointer: coarse)` — invisible to the
 * unit tests, and invisible to every other scenario here, none of which
 * emulates touch. So this one seeds the two fields the shell draws BELOW
 * 16px (a section's search box at 14, the editor's body at the base 15),
 * measures them where the rule applies and where it must not, and looks at
 * what the extra pixel did to the rows they sit in.
 */
const put = (bench, path, markdown) =>
  bench.api(`/api/pages/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })

async function go(page, hash) {
  await page.evaluate((to) => {
    location.hash = to
  }, hash)
  await page.waitForTimeout(900)
}

/** What a field renders at, by the selector that names it. */
const sizeOf = (page, selector) =>
  page.evaluate((css) => {
    const el = document.querySelector(css)
    return el ? getComputedStyle(el).fontSize : 'absent'
  }, selector)

export default async function scenario(bench) {
  // Six, because the search box only appears above five: the toolbar is not
  // worth drawing for a list the eye already reads.
  await put(bench, 'notes/INDEX.md', '---\ntitle: Notes\n---\n\n# Notes\n')
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await put(bench, `notes/note-${n}.md`, `---\ntitle: Note ${n}\n---\n\n# Note ${n}\n\nDu texte à toucher.\n`)
  }

  const phone = await bench.open({ width: 390, height: 844, touch: true })
  console.log('coarse pointer:', await phone.evaluate(() => matchMedia('(pointer: coarse)').matches))

  // The canvas, reached the way a thumb reaches it — through the control this
  // whole change exists to keep on screen.
  await phone.click('.adestia-ib[aria-label="Open apps"]')
  await phone.waitForTimeout(600)
  console.log('phone composer:', await sizeOf(phone, '.adestia-composer__input'))

  await go(phone, '/section/notes')
  await phone.waitForSelector('.adestia-search input')
  console.log('phone search:', await sizeOf(phone, '.adestia-search input'))
  await bench.shoot(phone, '1-section-search-phone')

  // A page opens as a READER; the field only exists once you take the pen —
  // which on a phone is the tap that used to zoom the screen for good.
  await go(phone, '/page/notes/note-1.md')
  await phone.click('.adestia-editor__actions .adestia-ib')
  await phone.waitForSelector('.adestia-editor__surface .ProseMirror')
  await phone.waitForTimeout(600)
  console.log('phone editor:', await sizeOf(phone, '.adestia-editor__surface .ProseMirror'))
  await bench.shoot(phone, '2-editor-phone')

  // The same two on a desk, where the floor must NOT apply: a mouse never
  // zoomed anything, and 14px is the size the toolbar was designed at.
  const desk = await bench.open({ width: 1280, height: 900 })
  await go(desk, '/section/notes')
  await desk.waitForSelector('.adestia-search input')
  console.log('desk search:', await sizeOf(desk, '.adestia-search input'))
  await bench.shoot(desk, '3-section-search-desk')
}
