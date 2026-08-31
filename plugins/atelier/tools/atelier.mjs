/* ── L'outil en ligne de commande : valide, migre ────────────────────────────
   Ce fichier était un BUNDLE — sept cents lignes tirées du shell dont ce
   plugin a été extrait, variables renommées, sans source dans ce dépôt. Il
   faisait exactement deux choses : `normalise` (web/convert.js) et `valide`
   (web/regles.js), toutes deux exportées par des modules qui vivent ici. Une
   copie compilée d'un savoir qui a déjà sa source dans le même dossier, c'est
   la forme la plus sûre de le faire diverger : celle où personne ne peut plus
   comparer.

   Il les importe donc, plutôt que de les contenir. Node lit ces deux modules
   tels quels — ils sont écrits pour le navigateur mais ne touchent ni au DOM
   ni à rien d'ambiant.

     node atelier.mjs valide <workbook.json>
     node atelier.mjs migre  <workbook.json> [--ecrit]
*/

import { readFileSync, writeFileSync } from 'node:fs'

import { normalise } from '../web/convert.js'
import { valide } from '../web/regles.js'

const [cmd, chemin, ...opts] = process.argv.slice(2)
if (!cmd || !chemin) {
  console.error('usage: atelier.mjs valide <workbook.json> | migre <workbook.json> [--ecrit]')
  process.exit(2)
}

const brut = JSON.parse(readFileSync(chemin, 'utf8'))
const wb = normalise(brut)

if (cmd === 'valide') {
  const errs = valide(wb)
  const version = brut.schemaVersion === '3.0' ? '3.0' : `${brut.schemaVersion} (normalisé 3.0)`
  console.log(`workbook ${wb.projet || '?'} ${version} — ${(wb.pieces || []).length} pièces, ${(wb.debit || []).length} plaques`)
  if (errs.length) {
    console.log(`\n✗ ${errs.length} erreur(s) :`)
    for (const e of errs) console.log('  •', e)
    process.exit(1)
  }
  console.log('\n✓ valide.')
} else if (cmd === 'migre') {
  // On n'écrit pas du faux : un converti qui ne valide pas ne remplace rien.
  const errs = valide(wb)
  if (errs.length) {
    console.error(`✗ le converti ne valide pas (${errs.length} erreurs) — on n'écrit pas du faux :`)
    for (const e of errs) console.error('  •', e)
    process.exit(1)
  }
  const txt = `${JSON.stringify(wb, null, 1)}\n`
  if (opts.includes('--ecrit')) {
    writeFileSync(chemin, txt)
    console.log(`✓ ${chemin} réécrit en 3.0.`)
  } else process.stdout.write(txt)
} else {
  console.error(`commande inconnue « ${cmd} »`)
  process.exit(2)
}
