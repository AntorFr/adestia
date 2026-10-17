/**
 * The shell components of docs/charte.md § 4, each in its states, light and dark,
 * then the sheet on a phone (a bottom sheet under 820 px).
 *
 * The product has no page for them yet (the screens adopt them in later tranches), so the
 * scenario draws the CLASSES into the live shell — the contract a plugin without React uses.
 */
const icon = (name) => `<svg class="adestia-icon" aria-hidden="true"><use href="#adestia-i-${name}"/></svg>`

const board = `
<div id="composants" style="position:fixed;inset:0;overflow:auto;z-index:50;background:var(--surface);color:var(--text);padding:24px;display:grid;gap:24px;align-content:start">
  <section style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <button class="adestia-btn">Neutral</button>
    <button class="adestia-btn adestia-btn--accent">Accent</button>
    <button class="adestia-btn adestia-btn--danger">Danger</button>
    <button class="adestia-btn adestia-btn--ghost">Ghost</button>
    <button class="adestia-btn" disabled>Disabled</button>
    <button class="adestia-btn adestia-btn--accent" aria-busy="true">${icon('loader-circle').replace('adestia-icon"', 'adestia-icon adestia-icon--spin"')}Busy</button>
    <button class="adestia-btn adestia-btn--sm">Small</button>
    <button class="adestia-btn adestia-btn--icon" aria-label="Settings">${icon('settings')}</button>
    <button class="adestia-btn adestia-btn--icon adestia-btn--ghost" aria-label="Delete">${icon('trash-2')}</button>
    <div class="adestia-segmented" role="radiogroup" aria-label="Theme">
      <button class="adestia-segmented__item" role="radio" aria-checked="false" aria-label="System" title="System">${icon('monitor')}</button>
      <button class="adestia-segmented__item" role="radio" aria-checked="true" aria-label="Light" title="Light">${icon('sun')}</button>
      <button class="adestia-segmented__item" role="radio" aria-checked="false" aria-label="Dark" title="Dark">${icon('moon')}</button>
    </div>
  </section>
  <section style="display:grid;gap:12px;max-width:360px">
    <div class="adestia-field"><label class="adestia-field__label" for="c1">Name</label><input id="c1" class="adestia-input" placeholder="A name"><p class="adestia-field__help">Shown in the list.</p></div>
    <div class="adestia-field"><label class="adestia-field__label" for="c2">Address</label><input id="c2" class="adestia-input" aria-invalid="true" value="nope"><p class="adestia-field__error">${icon('circle-alert')}Not a valid address.</p></div>
    <div class="adestia-field"><label class="adestia-field__label" for="c3">Kind</label><select id="c3" class="adestia-select"><option>One</option></select></div>
    <div class="adestia-field"><label class="adestia-field__label" for="c4">Notes</label><textarea id="c4" class="adestia-textarea" placeholder="Notes"></textarea></div>
    <label style="display:flex;gap:8px;align-items:center"><input class="adestia-toggle" type="checkbox" role="switch" checked> On</label>
    <label style="display:flex;gap:8px;align-items:center"><input class="adestia-toggle" type="checkbox" role="switch"> Off</label>
  </section>
  <section class="adestia-empty adestia-empty--state">
    <span class="adestia-empty__icon">${icon('folder')}</span>
    <p class="adestia-empty__text">Nothing here yet.</p>
    <div class="adestia-empty__action"><button class="adestia-btn adestia-btn--ghost">${icon('plus')}Add one</button></div>
  </section>
  <div class="adestia-popover" style="position:static;width:200px"><button class="adestia-btn adestia-btn--ghost">Popover item</button></div>
</div>`

const sheet = `
<div class="adestia-sheet" id="composants-sheet"><div class="adestia-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="cs-t" style="height:auto">
  <header class="adestia-sheet__head"><h2 id="cs-t" class="adestia-sheet__title">A sheet</h2><button class="adestia-btn adestia-btn--ghost adestia-btn--sm adestia-btn--icon" aria-label="Close">${icon('x')}</button></header>
  <div class="adestia-sheet__body"><div class="adestia-field"><label class="adestia-field__label" for="cs-i">Name</label><input id="cs-i" class="adestia-input"></div></div>
  <footer class="adestia-sheet__foot"><button class="adestia-btn">Cancel</button><button class="adestia-btn adestia-btn--accent">Save</button></footer>
</div></div>`

async function draw(bench, opts, name, withSheet) {
  const page = await bench.open(opts)
  await page.waitForSelector('body')
  await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), board)
  await bench.shoot(page, name)
  if (withSheet) {
    await page.evaluate((html) => document.body.insertAdjacentHTML('beforeend', html), sheet)
    await bench.shoot(page, `${name}-sheet`)
  }
}

export default async function scenario(bench) {
  await draw(bench, {}, '1-light', true)
  await draw(bench, { theme: 'dark' }, '2-dark', true)
  await draw(bench, { width: 390, height: 844 }, '3-phone', true)
}
