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
     node atelier.mjs migre  <workbook.json> --4 --famille <f> --regles <d> [--ecrit]
     node atelier.mjs derive <workbook.json> --regles <dossier> [--ecrit]
     node atelier.mjs chant  <workbook.json> --regles <dossier>
                             [--chante avant,arriere] [+ETIQ:bord] [-ETIQ:bord] [--ecrit]
*/

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { normalise } from '../web/convert.js'
import { valide } from '../web/regles.js'
import { fraicheur, signature, versQuatre } from '../moteur/design.mjs'
import { litTable, pourFamille } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'
import { diff, rendu } from '../moteur/diff.mjs'

const [cmd, chemin, ...opts] = process.argv.slice(2)
if (!cmd || !chemin) {
  console.error('usage: atelier.mjs etat|valide|migre|derive <workbook.json> [--regles <dossier>] [--ecrit]')
  process.exit(2)
}

/** L'option `--regles <dossier>` : d'où viennent les tables de décision. */
const valeurDe = (nom) => {
  const i = opts.indexOf(nom)
  return i >= 0 ? opts[i + 1] : undefined
}

/** Les tables d'un dossier, ou rien : le moteur ne devine aucun chemin. */
function litRegles(dossier) {
  if (!dossier) { console.error('--regles <dossier> est requis — les tables vivent dans la mémoire'); process.exit(2) }
  const tables = []
  for (const f of readdirSync(dossier).filter((n) => n.endsWith('.json')).sort()) {
    const { table, erreurs } = litTable(JSON.parse(readFileSync(join(dossier, f), 'utf8')), f)
    if (erreurs.length) { console.error(`✗ ${f} :`); for (const e of erreurs) console.error('  •', e); process.exit(1) }
    tables.push(table)
  }
  return tables
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
} else if (cmd === 'chant') {
  // Rajouter ou retirer un chant et voir les cotes suivre, sans éditer du
  // JSON à la main : c'est la manipulation la plus fréquente d'un projet, et
  // la seule chose qui compte est qu'elle recalcule.
  const tables = litRegles(valeurDe('--regles'))
  if (!wb.design) { console.error('chant : ce workbook n\'a pas de design'); process.exit(1) }

  const avant = derive(wb.design, tables)
  const design = { ...wb.design }
  const surcharge = { ...(wb.design.chants ?? {}) }

  const voit = valeurDe('--chante')
  if (voit !== undefined) design.faces_chantees = voit.split(',').map((f) => f.trim()).filter(Boolean)

  // `+ÉTIQ:bord` ajoute, `-ÉTIQ:bord` retire — sur ce que la pièce porte
  // AUJOURD'HUI, pas sur la surcharge : on raisonne sur le meuble, pas sur ce
  // qui restait à en dire. La dérivation vient de le calculer, on le lui prend.
  const effectifs = Object.fromEntries(avant.pieces.map((p) => [p.etiquette, p.chants ?? []]))
  for (const opt of opts) {
    const m = /^([+-])([^:]+):(.+)$/.exec(opt)
    if (!m) continue
    const [, signe, etiquette, bord] = m
    const actuels = effectifs[etiquette] ?? []
    surcharge[etiquette] = signe === '+'
      ? [...new Set([...actuels, bord])].sort()
      : actuels.filter((b) => b !== bord)
  }
  // Une clé `chants` vide n'est pas la même chose qu'une absence de clé : elle
  // ferait bouger l'empreinte du design sans rien changer au meuble.
  if (Object.keys(surcharge).length) design.chants = surcharge

  const apres = derive(design, tables)
  const delta = diff({ ...wb, pieces: avant.pieces }, { ...wb, design, pieces: apres.pieces })

  console.log(`workbook ${wb.projet || '?'} — faces chantées : ${(design.faces_chantees ?? []).join(', ') || 'aucune'}`)
  for (const p of apres.pieces)
    console.log(`  ${p.etiquette.padEnd(22)} ${String(p.longueur).padStart(5)} × ${String(p.largeur).padStart(4)}   ${(p.chants ?? []).join(', ') || '—'}`)
  console.log(`\n${rendu(delta)}`)
  for (const e of apres.ecartsChant ?? [])
    console.log(`  ⚠ ${e.etiquette} s'écarte des faces chantées : ${[...e.ajoutes.map((b) => '+' + b), ...e.retires.map((b) => '-' + b)].join(', ')}`)

  if (!apres.contraint) { console.log('\n✗ meuble non entièrement contraint — rien n\'est écrit.'); process.exit(1) }
  if (opts.includes('--ecrit')) {
    writeFileSync(chemin, `${JSON.stringify({ ...wb, design, pieces: apres.pieces, derive: signature(design, 'atelier@4.0') }, null, 1)}\n`)
    console.log(`\n✓ ${chemin} réécrit.`)
  } else console.log('\n(--ecrit pour l\'enregistrer)')
} else if (cmd === 'derive') {
  // Les tables viennent de la mémoire, jamais de l'image : le moteur ne les
  // cherche pas tout seul, on lui dit où elles sont.
  const tables = litRegles(valeurDe('--regles'))

  if (!wb.design) { console.error('derive : ce workbook n\'a pas de design — il n\'y a rien à dériver'); process.exit(1) }
  const r = derive(wb.design, tables)

  /* Le moteur calcule des cotes, pas tout un workbook. Une pièce en porte
     davantage — sa face du haut, ses préparations lamello, sa note — et rien
     de cela ne se recalcule aujourd'hui. Écraser la pièce entière par ce qui
     vient d'être calculé détruirait ce travail-là en silence, ce qui serait
     une drôle de façon de migrer. On fusionne donc : le calcul l'emporte sur
     ce qu'il produit, l'existant garde le reste. */
  const dejaLa = new Map((wb.pieces ?? []).map((p) => [p.etiquette, p]))
  const fusionnees = r.pieces.map((p) => ({ ...(dejaLa.get(p.etiquette) ?? {}), ...p }))

  console.log(`workbook ${wb.projet || '?'} — ${r.pieces.length} pièces, ${tables.length} table(s) lue(s)`)
  for (const j of r.journal) console.log(`  · ${j.table} ligne ${j.ligne} → ${j.methode ?? 'aucune méthode'}`)
  if (r.ecartees.length) console.log(`  · écartées (autre famille) : ${r.ecartees.join(', ')}`)

  const suivant = { ...wb, pieces: fusionnees, derive: signature(wb.design, 'atelier@4.0') }
  const delta = diff(wb, suivant)
  console.log(`\n${rendu(delta)}`)

  if (r.issues.length) {
    console.log(`\n${r.issues.length} point(s) à trancher :`)
    for (const i of r.issues) console.log(`  ${i.gravite === 'bloquant' ? '✗' : '⚠'} ${i.message}`)
  }

  if (!r.contraint) { console.log('\n✗ le meuble n\'est pas entièrement contraint — rien n\'est écrit.'); process.exit(1) }
  if (opts.includes('--ecrit')) {
    writeFileSync(chemin, `${JSON.stringify(suivant, null, 1)}\n`)
    console.log(`\n✓ ${chemin} réécrit, dérivé signé.`)
  } else console.log('\n✓ dérivation complète (--ecrit pour l\'enregistrer).')
} else if (cmd === 'migre' && opts.includes('--4')) {
  /* 3.0 → 4.0. La coquille est triviale ; la SOURCE, elle, ne se devine pas —
     des cotes ne disent pas les décisions dont elles sont sorties. On ne
     l'invente donc pas : on écrit le squelette des questions auxquelles ce
     meuble doit répondre, en les tirant des tables qui s'appliquent à sa
     famille, et on laisse quelqu'un y répondre.

     Ce qui rend la migration SÛRE vient après : `derive` sans `--ecrit`
     compare ce que le design produit aux pièces déjà là. On remplit, on
     dérive, on regarde l'écart, on recommence — jusqu'à ce qu'il soit nul,
     ou expliqué. Un écart qui reste n'est pas forcément une faute du design :
     ce peut être le meuble qui avait tort, et c'est comme ça qu'on l'apprend. */
  const famille = valeurDe('--famille')
  if (!famille) { console.error('migre --4 : --famille <famille> est requis — c\'est elle qui dit quelles questions se posent'); process.exit(2) }
  const tables = litRegles(valeurDe('--regles'))

  const quatre = versQuatre(wb)
  const { retenues, ecartees } = pourFamille(tables, famille)
  const questions = [...new Set(retenues.flatMap((t) => Object.keys(t.entrees)))].sort()

  const design = {
    famille,
    trigramme: wb.projet ?? null,
    hors_tout: { l: null, p: null, h: null },
    materiaux: { principal: { ep: null } },
    faces_chantees: [],
    parametres: {},
    ...Object.fromEntries(questions.map((q) => [q, null])),
  }

  console.log(`workbook ${wb.projet || '?'} ${brut.schemaVersion} → 4.0 — ${(wb.pieces || []).length} pièces conservées`)
  console.log(`  ${retenues.length} table(s) pour « ${famille} »${ecartees.length ? ` · ${ecartees.length} écartée(s)` : ''}`)
  console.log('\nÀ répondre avant de pouvoir dériver :')
  console.log('  · hors_tout (l, p, h) et l\'épaisseur du panneau')
  console.log('  · faces_chantees — ce qu\'on chante, pas ce qu\'on voit')
  for (const q of questions) {
    const domaines = retenues.filter((t) => t.entrees[q]).map((t) => t.entrees[q].join(' | '))
    console.log(`  · ${q} : ${[...new Set(domaines)].join('  ou  ')}`)
  }
  console.log('\nPuis : atelier.mjs derive <workbook> --regles <dossier>')
  console.log('       — il compare ce que le design produit aux pièces déjà là.')

  const sortie = { ...quatre, design }
  if (opts.includes('--ecrit')) {
    writeFileSync(chemin, `${JSON.stringify(sortie, null, 1)}\n`)
    console.log(`\n✓ ${chemin} réécrit en 4.0, design à remplir.`)
  } else process.stdout.write(`\n${JSON.stringify(sortie.design, null, 1)}\n`)
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
