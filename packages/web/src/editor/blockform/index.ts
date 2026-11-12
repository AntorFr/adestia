import type { PluginGalleryLine } from '@antorfr/adestia-schemas'

import { labelRange } from './label-range.js'
import { labelValue } from './label-value.js'
import { labelValueCaption } from './label-value-caption.js'
import { table } from './table.js'
import type { Codec } from './types.js'

export type { Cells, Codec, Decoded, Kept, Row } from './types.js'
export { cellKey, cellsOf, isDelimiter } from './table.js'
export { isIsoDate, isNumericValue, refuseCell, validateRow, type Problem, type Refusal } from './validate.js'

const CODECS: Readonly<Record<PluginGalleryLine, Codec>> = {
  'label-value-caption': labelValueCaption,
  'label-range': labelRange,
  'label-value': labelValue,
  table,
}

/** The codec a `fields.line` names — one per line format that exists. */
export function codecFor(line: PluginGalleryLine): Codec {
  return CODECS[line]
}
export { bodyLines, fenced, linesOfText } from './lines.js'
