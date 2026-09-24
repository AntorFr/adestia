/**
 * The barcode reader, as a shell capability.
 *
 * A composer button that opens a camera overlay. Two things are lazy on
 * purpose, and they nest:
 *
 *  1. the SCANNER itself loads on the first click — someone who never scans
 *     never pays for it;
 *  2. the zxing DECODER loads only if the browser has no BarcodeDetector,
 *     which on Android and Chrome desktop means never. It is ~140 kB, and it
 *     is the reason iOS works at all.
 *
 * Both are relative imports resolved against this file's own URL, so the
 * chunks travel in the plugin folder rather than in any shell bundle.
 */

/**
 * This plugin's two sentences. Keyed by the English one, like the shell's.
 *
 * The button's tooltip is drawn by the SHELL, from what this factory returns
 * — so it has to arrive already in the reader's language, which is what
 * `api.locale` is for.
 */
const WORDS = {
  fr: {
    'Scan barcodes': 'Scanner un code-barres',
    'scanner unavailable': 'scanner indisponible',
  },
}

const table = (locale) => WORDS[String(locale ?? '').slice(0, 2)] ?? {}

const words = (locale) => {
  const said = table(locale)
  return (key) => said[key] ?? key
}

export default function chrome(api) {
  const t = words(api?.locale)
  return {
    composer: [
      {
        id: 'scan',
        glyph: '▥',
        title: t('Scan barcodes'),
        onClick: async (api) => {
          try {
            const { openScanner } = await import(new URL('./scanner.js', import.meta.url))
            await openScanner(api)
          } catch (error) {
            // Said out loud in the composer rather than swallowed: a camera
            // that will not open is usually a permission the person can grant.
            api.compose(`[${t('scanner unavailable')}: ${error.message}]`)
          }
        },
      },
    ],
    // Handed over like every other plugin's: one table, whether the word is
    // said by this module or drawn by the shell on its behalf.
    words: table(api?.locale),
  }
}
