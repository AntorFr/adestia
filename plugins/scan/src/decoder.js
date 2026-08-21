/**
 * The zxing fallback decoder.
 *
 * Only reached where `BarcodeDetector` is missing — which in practice means
 * iOS. Bundled into `web/decoder.js`, so the plugin folder carries it and no
 * shell has to know it exists.
 */

import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HTMLCanvasElementLuminanceSource,
  HybridBinarizer,
  MultiFormatReader,
} from '@zxing/library'

const hints = new Map([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
    ],
  ],
  // Slower, and worth it: a barcode read off a shelf is rarely square to the
  // camera, and a reader that only sees perfect frames feels broken.
  [DecodeHintType.TRY_HARDER, true],
])

const reader = new MultiFormatReader()
reader.setHints(hints)

let canvas

/** @returns the codes found in one frame — an empty array is the normal case. */
export function decodeFrame(video) {
  if (!video.videoWidth) return []

  canvas ??= document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0)

  try {
    const source = new HTMLCanvasElementLuminanceSource(canvas)
    const result = reader.decode(new BinaryBitmap(new HybridBinarizer(source)))
    return result ? [result.getText()] : []
  } catch {
    // NotFoundException on most frames: that is what scanning looks like.
    return []
  }
}
