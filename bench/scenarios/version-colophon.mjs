/**
 * Which build is answering, said where somebody goes looking for it.
 *
 * The question is "did the deployment I just pushed actually land?", and
 * until now no surface answered it: the canvas header names the ENGINE, and
 * a phone does not even draw that line. The colophon at the foot of the cog
 * panel does, and the cog is reachable from either folded screen.
 *
 * The bench image is stamped `bench` by `run.sh`, which is what a deployed
 * image carries as `0.32.0` — same path, different string.
 */
const colophon = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.adestia-cog__build')
    if (!el) return 'absent'
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return {
      says: el.textContent,
      look: `${style.fontSize} ${style.color}`,
      bottom: `${Math.round(box.bottom)} of ${window.innerHeight}`,
    }
  })

export default async function scenario(bench) {
  console.log('what the server answers:', (await bench.api('/api/instance')).version)

  const desk = await bench.open({ width: 1280, height: 900 })
  await desk.click('.adestia-ib[aria-label="Réglages"]')
  await desk.waitForSelector('.adestia-cog__panel')
  console.log('on a desktop:', JSON.stringify(await colophon(desk)))
  await bench.shoot(desk, '1-cog-colophon')

  // On a phone the panel covers most of the screen, and the foot of it is
  // the place a long panel is likeliest to push out of view.
  const phone = await bench.open({ width: 390, height: 844, touch: true })
  await phone.click('.adestia-edge[data-side="right"]')
  await phone.waitForSelector('.adestia-shell[data-screen="canvas"]')
  await phone.click('.adestia-ib[aria-label="Réglages"]')
  await phone.waitForSelector('.adestia-cog__panel')
  console.log('on a phone:', JSON.stringify(await colophon(phone)))
  await bench.shoot(phone, '2-cog-colophon-phone')

  const night = await bench.open({ width: 1280, height: 900, theme: 'dark' })
  await night.click('.adestia-ib[aria-label="Réglages"]')
  await night.waitForSelector('.adestia-cog__panel')
  console.log('in the dark:', JSON.stringify(await colophon(night)))
  await bench.shoot(night, '3-cog-colophon-dark')
}
