/**
 * The smallest seed: an instance with its configuration and nothing else.
 *
 * The seed format (ARCHITECTURE.md, « Detail of AD-2 and AD-3 »): a module that
 * default-exports `async ({ workspace, dataDir }) => config`. It writes whatever
 * the screens need — pages, thread files, plugin data — into those two
 * directories the way the product itself stores them (docs/donnees.md), and
 * returns the instance configuration as YAML text. The launcher then sets the
 * port, the directories, the locale and the skin on top; a seed never names them.
 *
 * It may also export `scripts`, the fake engine's scripted answers for this seed.
 */
export default async function seed() {
  return `name: Adestia bench
auth:
  mode: none
`
}
