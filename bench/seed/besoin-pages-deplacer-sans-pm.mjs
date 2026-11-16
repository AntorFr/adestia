/** `besoin-pages-deplacer` with `project-management` NOT enabled: its blocks must not be in the gallery. */
import { build } from './besoin-pages-deplacer.mjs'

export { scripts, engine, config } from './besoin-pages-deplacer.mjs'
export default (ctx) => build(ctx, { projectManagement: false })
