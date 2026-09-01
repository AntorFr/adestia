/* ── L'outil en ligne de commande : etat, valide, migre ──────────────────────
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

     node atelier.mjs etat   <workbook.json>
     node atelier.mjs valide <workbook.json>
     node atelier.mjs migre  <workbook.json> [--ecrit]
*/

import { readFileSync, writeFileSync } from 'node:fs'

import { normalise } from '../web/convert.js'
import { valide } from '../web/regles.js'
import { fraicheur } from '../moteur/design.mjs'

const [cmd, chemin, ...opts] = process.argv.slice(2)
if (!cmd || !chemin) {
  console.error('usage: atelier.mjs etat <workbook.json> | valide <workbook.json> | migre <workbook.json> [--ecrit]')
  process.exit(2)
}

const brut = JSON.parse(readFileSync(chemin, 'utf8'))
const wb = normalise(brut)

const version = ['3.0', '4.0'].includes(brut.schemaVersion)
  ? brut.schemaVersion
  : `${brut.schemaVersion} (normalisé 3.0)`

/** L'accord entre la source et ce qui en découle, en une ligne. */
const ETATS = {
  frais: (f) => `✓ dérivé à jour (${f.de})`,
  perime: (f) => `✗ dérivé PÉRIMÉ — ${f.raison}\n    signé ${f.de}, le design vaut ${f.attendu}`,
  'non-signe': (f) => `⚠ dérivé non signé — ${f.raison}`,
  orphelin: (f) => `· dérivé orphelin — ${f.raison}`,
}

if (cmd === 'etat') {
  const f = fraicheur(wb)
  console.log(`workbook ${wb.projet || '?'} ${version} — ${(wb.pieces || []).length} pièces, ${(wb.debit || []).length} plaques`)
  console.log(`  ${ETATS[f.etat](f)}`)
  process.exit(f.etat === 'perime' ? 1 : 0)
} else if (cmd === 'valide') {
  const errs = valide(wb)
  const f = fraicheur(wb)
  console.log(`workbook ${wb.projet || '?'} ${version} — ${(wb.pieces || []).length} pièces, ${(wb.debit || []).length} plaques`)
  if (f.etat !== 'orphelin') console.log(`  ${ETATS[f.etat](f)}`)
  if (errs.length) {
    console.log(`\n✗ ${errs.length} erreur(s) :`)
    for (const e of errs) console.log('  •', e)
    process.exit(1)
  }
  // Un dérivé périmé est géométriquement cohérent avec lui-même et faux quand
  // même : il décrit un meuble que le design ne décrit plus. On ne coupe pas
  // sur un plan que personne n'a recalculé.
  if (f.etat === 'perime') {
    console.log('\n✗ géométrie valide, mais le dérivé ne vient plus de ce design — relancer la dérivation.')
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
    console.log(`✓ ${chemin} réécrit en ${wb.schemaVersion}.`)
  } else process.stdout.write(txt)
} else {
  console.error(`commande inconnue « ${cmd} »`)
  process.exit(2)
}
