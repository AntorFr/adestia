// Builds one headless Milkdown editor and exposes parse/serialize.
// IMPORTANT: bootstrap-dom.js must have run before this module loads.
import {
  Editor,
  defaultValueCtx,
  parserCtx,
  remarkStringifyOptionsCtx,
  rootCtx,
  serializerCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'

import { adestiaPlugins } from './plugins.js'

export async function createRoundTripper() {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.body)
      ctx.set(defaultValueCtx, '')
      // Match the house style of the source files instead of
      // remark-stringify defaults (`*` bullets, `***` rules).
      ctx.set(remarkStringifyOptionsCtx, {
        bullet: '-',
        rule: '-',
      })
    })
    .use(commonmark)
    .use(gfm)
    .use(adestiaPlugins)
    .create()

  const roundTrip = (markdown) =>
    editor.action((ctx) => {
      const parser = ctx.get(parserCtx)
      const serializer = ctx.get(serializerCtx)
      const doc = parser(markdown)
      if (!doc) throw new Error('parser returned no document')
      return { doc, output: serializer(doc) }
    })

  const destroy = () => editor.destroy()

  return { roundTrip, destroy }
}
