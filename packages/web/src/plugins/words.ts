/**
 * Saying a word a PLUGIN declared, in the reader's language.
 *
 * Three tables, in this order, and the order is the whole rule:
 *
 * 1. **the plugin's own**, for the words it declared — a field's `label`, its
 *    `help`, a tile's name, a block's `description`. Those live in the
 *    manifest, which is data the shell draws itself, so the plugin never gets
 *    to say them on its own screen;
 * 2. **the shell's**, so a plugin that labels a field `Title` or a button
 *    `Save` inherits a translation it never had to write;
 * 3. **the English sentence**, which is the honest failure — visibly
 *    untranslated beats mistranslated, and beats an identifier by a mile.
 *
 * A plugin's table applies to that plugin's own declarations and nowhere else.
 * Letting one reach the shell's own words would mean an app could rename
 * `Settings` for everybody, which is the same reason a skin carries no words:
 * a livery is a look, and an app is an app — neither is the interface's
 * language.
 */

import type { LoadedPlugin } from './loader.js'

/** What the shell calls to say one declared word. `core` and unknown ids fall through. */
export type Say = (plugin: string | undefined, key: string) => string

export function wordsFor(
  loaded: readonly Pick<LoadedPlugin, 'id' | 'words'>[],
  t: (key: string) => string,
): Say {
  const tables = new Map(loaded.filter((one) => one.words).map((one) => [one.id, one.words!]))
  return (plugin, key) => {
    const table = plugin === undefined ? undefined : tables.get(plugin)
    // `hasOwn` rather than a truthiness test: a plugin translating a word to
    // the empty string means the empty string, and a table that inherited
    // `toString` from Object must not answer for `toString`.
    return table !== undefined && Object.hasOwn(table, key) ? table[key]! : t(key)
  }
}
