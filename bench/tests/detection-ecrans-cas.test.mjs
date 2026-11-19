// Cases of the one screen-test rule (estTestDEcran, scripts/niveaux.mjs): what reaches the browser
// through ./charte-browser is a screen test; a file that only imports awaitShell is not.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estTestDEcran } from '../../scripts/niveaux.mjs'

const casOui = {
  'named launch': "import { launch } from './charte-browser'\nawait launch('s','d','en')",
  'named open, .js suffix': "import { open, awaitShell } from './charte-browser.js'\nawait open(b, u, {})",
  'newBrowser on several lines': "import {\n  awaitShell,\n  newBrowser,\n} from './charte-browser'\nawait newBrowser()",
  'namespace import': "import * as h from './charte-browser'\nawait h.launch('a','b','c')",
  'double quotes': 'import { launch } from "./charte-browser"\nlaunch()',
  'playwright cited': "import { chromium } from 'playwright'",
  'launch.mjs cited': "spawn('node', ['bench/launch.mjs'])",
}
const casNon = {
  'awaitShell only, fake page': "import { awaitShell } from './charte-browser'\nawait awaitShell(fakePage, 'http://x', '/')",
  'no browser at all': "import { describe, it } from 'vitest'\nit('x', () => {})",
  'other helper named like it': "import { launch } from './charte-browser-notes'\nlaunch()",
}

for (const [nom, src] of Object.entries(casOui)) test(`screen test: ${nom}`, () => assert.equal(estTestDEcran(src), true))
for (const [nom, src] of Object.entries(casNon)) test(`plain test: ${nom}`, () => assert.equal(estTestDEcran(src), false))
