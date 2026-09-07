/**
 * The page as the authority, and the boundary that follows from it.
 *
 * A period's shape is read from the page that declares it, so this is where
 * two things are pinned: that the frontmatter is understood the way people
 * actually write YAML, and that a `data:` cannot point anywhere a page has no
 * business pointing. The second is what makes this plugin's routes safe —
 * they take a PAGE, and reach a data file only through what that page claims.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { conventionalData, resolveData, safePagePath, shapeOf } from '../shape.mjs'

const page = (body) => `---\n${body}\n---\n\nDu texte.\n`

test('a period is shaped by its own frontmatter', () => {
  const shape = shapeOf(
    'sante/septembre.md',
    page(
      [
        'title: Semaine type — septembre',
        'type: meals',
        'ico: 📊',
        'debut: 2026-09-01',
        'fin: 2026-09-04',
        'sections: [matin, midi, goûter, soir]',
        'data: assets/septembre.meals.json',
      ].join('\n'),
    ),
  )
  assert.equal(shape.type, 'meals')
  assert.equal(shape.titre, 'Semaine type — septembre')
  assert.equal(shape.debut, '2026-09-01')
  assert.deepEqual(shape.sections, ['matin', 'midi', 'goûter', 'soir'])
  assert.equal(shape.data, 'sante/assets/septembre.meals.json')
})

test('a list is read whichever way YAML allows it', () => {
  const block = shapeOf('x.md', page('type: meals\nsections:\n  - matin\n  - soir'))
  assert.deepEqual(block.sections, ['matin', 'soir'])
  // And quotes come off, because people write them.
  const quoted = shapeOf('x.md', page('type: meals\nsections: ["petit-déj", \'soir\']'))
  assert.deepEqual(quoted.sections, ['petit-déj', 'soir'])
})

test('what a period may leave unsaid', () => {
  const bare = shapeOf('sante/septembre.md', page('type: meals'))
  // No dates is a legitimate state — a tray of ideas — not a broken page.
  assert.equal(bare.debut, undefined)
  assert.deepEqual(bare.sections, ['matin', 'midi', 'soir'])
  // And the data file has a convention, so framing a period is writing a page.
  assert.equal(bare.data, 'sante/assets/septembre.meals.json')
  assert.equal(conventionalData('a/b/c.md'), 'a/b/assets/c.meals.json')
  // A date that is not one is ignored rather than carried to a comparison.
  assert.equal(shapeOf('x.md', page('type: meals\ndebut: la semaine prochaine')).debut, undefined)
  // No frontmatter at all: nothing to claim, and the page stays ordinary.
  assert.equal(shapeOf('x.md', 'Juste du texte.\n'), undefined)
})

test('a `data:` cannot leave the page it belongs to', () => {
  assert.equal(resolveData('sante/x.md', 'assets/y.meals.json'), 'sante/assets/y.meals.json')
  // Climbing out is refused, never folded back: it is not a typo to repair.
  assert.equal(resolveData('sante/x.md', '../../etc/passwd.meals.json'), undefined)
  assert.equal(resolveData('sante/x.md', '.hidden/y.meals.json'), undefined)
  // The suffix is what makes it ours. Without this a page could aim the
  // plugin's writer at any JSON in the memory.
  assert.equal(resolveData('sante/x.md', 'assets/salaires.json'), undefined)
  assert.equal(resolveData('sante/x.md', ''), undefined)
})

test('a page path from a request stays user input until proven otherwise', () => {
  assert.equal(safePagePath('sante/septembre.md'), 'sante/septembre.md')
  // A leading slash is a clumsy relative path, not an escape.
  assert.equal(safePagePath('/x.md'), 'x.md')
  assert.equal(safePagePath('../../etc/passwd.md'), undefined)
  assert.equal(safePagePath('a/.git/config.md'), undefined)
  assert.equal(safePagePath('x\0.md'), undefined)
  // Only pages: the routes exist to follow a page's declaration.
  assert.equal(safePagePath('sante/septembre.meals.json'), undefined)
  assert.equal(safePagePath(42), undefined)
})
