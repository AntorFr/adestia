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

export default function chrome() {
  return {
    composer: [
      {
        id: 'scan',
        glyph: '▥',
        title: 'Scan barcodes',
        onClick: async (api) => {
          try {
            const { openScanner } = await import(new URL('./scanner.js', import.meta.url))
            await openScanner(api)
          } catch (error) {
            // Said out loud in the composer rather than swallowed: a camera
            // that will not open is usually a permission the person can grant.
            api.compose(`[scanner unavailable: ${error.message}]`)
          }
        },
      },
    ],
  }
}
