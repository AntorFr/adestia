/* ── Le moteur, à portée de l'agent ──────────────────────────────────────────
   Cinq outils, pas trente. Chaque outil déclaré coûte du contexte à CHAQUE
   tour, et l'économie de contexte est la moitié du sujet : un moteur qui rend
   l'agent plus cher n'a rien réglé. Les règles sont des DONNÉES que le moteur
   consulte, pas des outils que l'agent choisit — c'est pour ça que trente
   outils ne seraient pas trente fois mieux.

   JSON-RPC sur stdio, écrit directement plutôt que par le SDK : quatre
   méthodes, aucune négociation de transport, et une dépendance de moins pour
   un plugin qui n'en a aucune. Même choix que le MCP entrant du serveur, pour
   la même raison, et le même patron.

   Une erreur revient en `isError` avec son texte, jamais en erreur JSON-RPC :
   ce que le modèle lit, c'est le contenu. Une erreur de protocole finit dans
   un journal que personne ne regarde pendant un tour. */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { litTable, pourFamille } from '../moteur/tables.mjs'
import { derive } from '../moteur/derive/index.mjs'
import { calepine } from '../moteur/debit/calepine.mjs'
import { chantsRetenus } from '../moteur/modele/visibilite.mjs'
import { fraicheur, signature } from '../moteur/design.mjs'
import { diff, rendu } from '../moteur/diff.mjs'

const lisWorkbook = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'))

const lisRegles = (dossier) => {
  const tables = []
  for (const f of readdirSync(dossier).filter((n) => n.endsWith('.json')).sort()) {
    const { table, erreurs } = litTable(JSON.parse(readFileSync(join(dossier, f), 'utf8')), f)
    if (erreurs.length) throw new Error(`${f} :\n  ${erreurs.join('\n  ')}`)
    tables.push(table)
  }
  return tables
}

/** Le tableau des pièces, tel qu'on le lit à l'atelier. */
const enTableau = (pieces) => pieces
  .map((p) => `  ${p.etiquette.padEnd(24)} ${String(p.longueur).padStart(6)} × ${String(p.largeur).padStart(5)}`
    + `  ${p.ep ? `${p.ep} mm` : ''}  ${(p.chants ?? []).join(', ') || '—'}`)
  .join('\n')

const rapport = (wb, r, plan) => {
  const lignes = [`${r.pieces.length} pièces`]
  for (const j of r.journal)
    lignes.push(`  · ${j.table} ligne ${j.ligne} → ${j.methode ?? 'aucune méthode'}`
      + (j.deroge ? `  (dérogation : ${j.deroge.join(' ; ')})` : ''))
  lignes.push('', enTableau(r.pieces))
  for (const j of plan ?? [])
    lignes.push(`\n  ${j.materiau} : ${j.plaques} plaque(s) ${j.sens}, ${j.reglages} réglage(s),`
      + ` chute ${j.chute} mm — en ${j.autre.sens} : ${j.autre.plaques} plaque(s)`)
  if (r.issues.length) {
    lignes.push('', `${r.issues.length} point(s) à trancher :`)
    for (const i of r.issues) lignes.push(`  ${i.gravite === 'bloquant' ? '✗' : '⚠'} ${i.message}`)
  }
  return lignes.join('\n')
}

/* ── Les cinq outils ──────────────────────────────────────────────────────── */

const OUTILS = [
  {
    name: 'atelier_derive',
    description:
      'Dérive un workbook 4.0 : interroge les tables, applique les méthodes, résout les cotes, '
      + 'calepine le débit dans les deux sens de plaque. Rend les pièces cotées, ce qui reste à '
      + 'trancher, et le delta avec ce que le fichier contenait. N\'écrit que si `ecrit` est vrai '
      + 'ET que tout est déterminé.',
    params: { workbook: 'chemin du workbook.json', regles: 'dossier des tables de décision', ecrit: 'true pour enregistrer' },
    requis: ['workbook', 'regles'],
    async run({ workbook, regles, ecrit }) {
      const wb = lisWorkbook(workbook)
      if (!wb.design) return { ok: false, error: 'ce workbook n\'a pas de design — rien à dériver' }
      const r = derive(wb.design, lisRegles(regles))
      const dejaLa = new Map((wb.pieces ?? []).map((p) => [p.etiquette, p]))
      const pieces = r.pieces.map((p) => ({ ...(dejaLa.get(p.etiquette) ?? {}), ...p }))
      const { debit, journal: plan } = calepine(pieces, wb.materiaux ?? [], wb.meta ?? {})
      const suivant = { ...wb, pieces, debit, derive: signature(wb.design, 'atelier@4.0') }

      const texte = [rapport(wb, r, plan), '', rendu(diff(wb, suivant))].join('\n')
      if (!r.contraint) return { ok: true, text: `${texte}\n\n✗ meuble non entièrement contraint — rien n'est écrit.` }
      if (ecrit === true || ecrit === 'true') {
        writeFileSync(workbook, `${JSON.stringify(suivant, null, 1)}\n`)
        return { ok: true, text: `${texte}\n\n✓ ${workbook} réécrit, dérivé signé.` }
      }
      return { ok: true, text: `${texte}\n\n(ecrit: true pour enregistrer)` }
    },
  },

  {
    name: 'atelier_questions',
    description:
      'Ce que ce design ne dit pas encore : les entrées de table sans réponse, les cotes que '
      + 'rien ne détermine, les paramètres d\'atelier manquants. À appeler avant de coter quoi '
      + 'que ce soit — une question non posée est une cote fausse.',
    params: { workbook: 'chemin du workbook.json', regles: 'dossier des tables de décision' },
    requis: ['workbook', 'regles'],
    async run({ workbook, regles }) {
      const wb = lisWorkbook(workbook)
      const tables = lisRegles(regles)
      if (!wb.design) {
        const questions = [...new Set(tables.flatMap((t) => Object.keys(t.entrees)))].sort()
        return { ok: true, text: `Aucun design. À répondre :\n${questions.map((q) => `  · ${q}`).join('\n')}` }
      }
      const r = derive(wb.design, tables)
      const { ecartees } = pourFamille(tables, wb.design.famille)
      if (!r.issues.length) return { ok: true, text: 'Rien à trancher : le meuble est entièrement déterminé.' }
      return {
        ok: true,
        text: [
          `${r.issues.length} point(s) à trancher :`,
          ...r.issues.map((i) => `  ${i.gravite === 'bloquant' ? '✗' : '⚠'} ${i.message}`),
          ...(ecartees.length ? [`\nTables écartées (autre famille) : ${ecartees.map((t) => t.id).join(', ')}`] : []),
        ].join('\n'),
      }
    },
  },

  {
    name: 'atelier_chant',
    description:
      'Change ce qui est chanté et recalcule les cotes. `faces` remplace les faces chantées du '
      + 'meuble ; `ajoute` et `retire` visent une pièce (`ÉTIQUETTE:bord`). Une cote de coupe '
      + 'suit toujours : une bande plaquée se rend d\'avance.',
    params: {
      workbook: 'chemin du workbook.json', regles: 'dossier des tables',
      faces: 'faces chantées, séparées par des virgules', ajoute: 'ÉTIQUETTE:bord', retire: 'ÉTIQUETTE:bord',
      ecrit: 'true pour enregistrer',
    },
    requis: ['workbook', 'regles'],
    async run({ workbook, regles, faces, ajoute, retire, ecrit }) {
      const wb = lisWorkbook(workbook)
      if (!wb.design) return { ok: false, error: 'ce workbook n\'a pas de design' }
      const tables = lisRegles(regles)
      const avant = derive(wb.design, tables)

      const design = { ...wb.design }
      const surcharge = { ...(wb.design.chants ?? {}) }
      if (faces !== undefined) design.faces_chantees = faces.split(',').map((f) => f.trim()).filter(Boolean)

      const effectifs = Object.fromEntries(avant.pieces.map((p) => [p.etiquette, p.chants ?? []]))
      for (const [op, signe] of [[ajoute, '+'], [retire, '-']]) {
        if (!op) continue
        const [etiquette, bord] = op.split(':')
        const actuels = effectifs[etiquette] ?? []
        surcharge[etiquette] = signe === '+'
          ? [...new Set([...actuels, bord])].sort()
          : actuels.filter((b) => b !== bord)
      }
      if (Object.keys(surcharge).length) design.chants = surcharge

      const apres = derive(design, tables)
      const delta = diff({ ...wb, pieces: avant.pieces }, { ...wb, design, pieces: apres.pieces })
      const texte = [enTableau(apres.pieces), '', rendu(delta)].join('\n')

      if (!apres.contraint) return { ok: true, text: `${texte}\n\n✗ meuble non entièrement contraint — rien n'est écrit.` }
      if (ecrit === true || ecrit === 'true') {
        const { debit } = calepine(apres.pieces, wb.materiaux ?? [], wb.meta ?? {})
        writeFileSync(workbook, `${JSON.stringify({ ...wb, design, pieces: apres.pieces, debit, derive: signature(design, 'atelier@4.0') }, null, 1)}\n`)
        return { ok: true, text: `${texte}\n\n✓ ${workbook} réécrit.` }
      }
      return { ok: true, text: `${texte}\n\n(ecrit: true pour enregistrer)` }
    },
  },

  {
    name: 'atelier_explique',
    description:
      'D\'où vient une cote : les règles qui la déterminent, nommées. À utiliser quand une cote '
      + 'surprend — plutôt que de la recalculer de tête, ce qui est la façon dont on se trompe.',
    params: { workbook: 'chemin du workbook.json', regles: 'dossier des tables', piece: 'étiquette de la pièce' },
    requis: ['workbook', 'regles', 'piece'],
    async run({ workbook, regles, piece }) {
      const wb = lisWorkbook(workbook)
      if (!wb.design) return { ok: false, error: 'ce workbook n\'a pas de design' }
      const r = derive(wb.design, lisRegles(regles))
      const p = r.pieces.find((x) => x.etiquette === piece)
      if (!p) {
        return {
          ok: false,
          error: `« ${piece} » n'est pas une pièce de ce meuble. Connues : ${r.pieces.map((x) => x.etiquette).join(', ')}`,
        }
      }
      return {
        ok: true,
        text: [
          `${p.etiquette} — ${p.longueur} × ${p.largeur}${p.ep ? ` × ${p.ep}` : ''}`,
          `  chants : ${(p.chants ?? []).join(', ') || 'aucun'}`,
          `  sa longueur vient de : ${(p.de ?? []).join(', ') || '—'}`,
          '',
          'Décisions qui ont produit cette pièce :',
          ...r.journal.map((j) => `  · ${j.table} ligne ${j.ligne} → ${j.methode ?? 'aucune méthode'}`),
        ].join('\n'),
      }
    },
  },

  {
    name: 'atelier_etat',
    description:
      'Le dérivé est-il encore d\'accord avec son design ? Un workbook dont la source a bougé '
      + 'depuis le dernier calcul est cohérent avec lui-même et décrit un meuble que le design '
      + 'ne décrit plus. On ne coupe pas sur un plan que personne n\'a recalculé.',
    params: { workbook: 'chemin du workbook.json' },
    requis: ['workbook'],
    async run({ workbook }) {
      const wb = lisWorkbook(workbook)
      const f = fraicheur(wb)
      const dit = {
        frais: `✓ dérivé à jour (${f.de})`,
        perime: `✗ dérivé PÉRIMÉ — ${f.raison}\n  signé ${f.de}, le design vaut ${f.attendu}`,
        'non-signe': `⚠ dérivé non signé — ${f.raison}`,
        orphelin: `· dérivé orphelin — ${f.raison}`,
      }
      return { ok: true, text: `${wb.projet ?? '?'} ${wb.schemaVersion} — ${(wb.pieces ?? []).length} pièces\n${dit[f.etat]}` }
    },
  },
]

/* ── Le transport ─────────────────────────────────────────────────────────── */

const parNom = new Map(OUTILS.map((o) => [o.name, o]))
const ecris = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`)
const repond = (id, result) => { if (id !== undefined) ecris({ jsonrpc: '2.0', id, result }) }

async function traite(message) {
  switch (message.method) {
    case 'initialize':
      return repond(message.id, {
        protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'atelier', version: '1' },
      })
    case 'notifications/initialized':
      return
    case 'tools/list':
      return repond(message.id, {
        tools: OUTILS.map((o) => ({
          name: o.name,
          description: o.description,
          inputSchema: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(o.params).map(([nom, description]) => [nom, { type: 'string', description }]),
            ),
            required: o.requis,
          },
        })),
      })
    case 'tools/call': {
      const outil = parNom.get(message.params?.name)
      if (!outil) {
        return repond(message.id, {
          content: [{ type: 'text', text: `outil inconnu « ${message.params?.name} »` }],
          isError: true,
        })
      }
      let issue
      try {
        issue = await outil.run(message.params?.arguments ?? {})
      } catch (e) {
        // Formulé pour l'AGENT : `isError` atteint le modèle, une erreur
        // JSON-RPC atteint un journal que personne ne regarde pendant un tour.
        issue = { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
      return repond(message.id, {
        content: [{ type: 'text', text: issue.ok ? issue.text : issue.error }],
        ...(issue.ok ? {} : { isError: true }),
      })
    }
    default:
      // `ping` et le reste : répondre plutôt que bloquer une poignée de main
      // sur une méthode dont un serveur d'outils n'a que faire.
      if (message.id !== undefined) repond(message.id, {})
  }
}

let tampon = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', async (bout) => {
  tampon += bout
  let saut = tampon.indexOf('\n')
  while (saut >= 0) {
    const ligne = tampon.slice(0, saut).trim()
    tampon = tampon.slice(saut + 1)
    if (ligne) {
      try {
        await traite(JSON.parse(ligne))
      } catch {
        // Une ligne illisible n'a pas d'id : il n'y a personne à qui répondre.
      }
    }
    saut = tampon.indexOf('\n')
  }
})

export { OUTILS }
