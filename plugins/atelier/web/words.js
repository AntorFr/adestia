/**
 * The words the atelier says, in the languages it speaks.
 *
 * The KEY is the English sentence and is what the engine says when no table
 * answers; the `fr` values are the French the engine said before it had a
 * table, letter for letter — a French instance reads the same words it always
 * did (B-1), and `test/hub-fr.txt` is the proof. The French addresses the
 * reader as *vous*.
 *
 * Placeholders are `%name`, filled from the values `t(key, values)` receives.
 * A plural is two keys (`%n cross-cut` / `%n cross-cuts`), never a word with
 * an `s` glued on: another language does not plural the way these two do.
 * Some French values read the same for one and for many: that is what the
 * engine said, and a translation is not the place to fix it.
 *
 * Values may carry markup (`<b>`, a coloured `<span>` handed in as a
 * placeholder) because the engine puts them in innerHTML. What the USER wrote
 * — a workbook's title, a piece's label, a material — never goes through this
 * table: the engine escapes it with `esc()` and says it as it is.
 *
 * WHAT STAYS FRENCH, ON PURPOSE: the messages of `regles.js` (the rules'
 * grievances) and `convert.js`. They are what the plugin's CLI and its MCP
 * server print to the agent, not what this screen says; the screen never
 * imports `valide`, and `git grep -n "valide" plugins/atelier/web/app.js
 * plugins/atelier/web/view.js` shows no import of it.
 */

const WORDS = {
  fr: {
    'Home': 'Accueil',
    'The Workshop': 'L’Atelier',
    'loading…': 'chargement…',
    'The Workshop is unavailable.': 'Atelier indisponible.',
    'Woodworking follow-up — your cutting plans.': 'Suivi menuiserie — vos plans de débit.',
    'No workbook — ask Alfred to generate one (woodworking skill).': 'Aucun workbook — demandez à Alfred d’en générer un (skill menuiserie).',
    'Workbooks': 'Workbooks',
    'never': 'jamais',
    'steps': 'étapes',
    '%n piece': '%n pièces',
    '%n pieces': '%n pièces',
    'Unreadable workbook (%err).': 'Workbook illisible (%err).',
    'Sheets': 'Plaques',
    'Cross-cuts': 'Tronçons',
    'Grooves': 'Rainures',
    'Lamello': 'Lamello',
    'Assembly': 'Assemblage',
    'Follow-up': 'Suivi',
    'Woodworking workbook · %done/%total steps': 'Workbook menuiserie · %done/%total étapes',
    '▶ Workshop mode': '▶ Mode atelier',
    ' · trim %d · cross-cut +%n': ' · dérasage %d · tronçon +%n',
    'sheet %L × %H mm': 'plaque %L × %H mm',
    '✓ Bench open': '✓ Établi ouvert',
    '✎ Rearrange': '✎ Remanier',
    'Quarter turn': 'Quart de tour',
    'Forbidden: %grain — the panel grain dictates the direction': 'Interdit : %grain — le fil du panneau impose le sens',
    '⟲ Rotate': '⟲ Tourner',
    'guide': 'guide',
    'len.': 'long.',
    'Band standing (cross-cuts stacked) or lying': 'Bande debout (tronçons empilés) ou couchée',
    'lying': 'couchée',
    'standing': 'debout',
    'Take its %n piece(s) out first': 'Sortez d’abord ses %n pièce(s)',
    '✕ Delete': '✕ Supprimer',
    '＋ Column': '＋ Colonne',
    'Take back Alfred’s proposal': "Reprendre la proposition d'Alfred",
    '↺ Hand back (%n)': '↺ Rendre la main (%n)',
    'No cutting plan.': 'Pas de plan de débit.',
    'SHEET %id': 'PLAQUE %id',
    'To fix': 'À corriger',
    'the cutting plan will not go through as it stands': "le débit ne passera pas en l'état",
    'to cut': 'à débiter',
    'cut ✓': 'débité ✓',
    'edge to band (edge banding)': 'arête à plaquer (chant)',
    'drag a piece · edges snap, adding the saw kerf': 'glisser une pièce · les bords s’aimantent en ajoutant le trait de scie',
    'click a column → detail/cut · click the name → the piece': 'clic colonne → détail/débiter · clic sur le nom → la pièce',
    'Drop your layout and go back to Alfred’s?': 'Abandonner votre calepinage et reprendre celui d’Alfred ?',
    'No columns.': 'Pas de colonnes.',
    'Ripped sheets → cross-cutting. Each kind of column (identical ones grouped ×N), its cross-cuts dimensioned, and the cumulative cut position (stop) — <b>at the same scale</b> from one band to the next. Ticking a column = cross-cut.': "Plaques refendues → tronçonnage. Chaque type de colonne (identiques regroupées ×N), ses tronçons cotés, et la position de coupe cumulée (butée) — <b>à la même échelle</b> d'une bande à l'autre. Cocher une colonne = tronçonnée.",
    'column with no cross-cutting step — for Alfred to consolidate': 'colonne sans étape de tronçonnage — à consolider par Alfred',
    'Guide %n mm': 'Guide %n mm',
    '%n cross-cuts': '%n tronçons',
    '%n cross-cut': '%n tronçon',
    '×%n columns': '×%n colonnes',
    '×%n column': '×%n colonne',
    'cross-cut': 'tronçon',
    'banded side (edge banding)': 'côté plaqué (chant)',
    'tick a chip = column cross-cut · click the name → the piece': 'cocher une pastille = colonne tronçonnée · clic sur le nom → la pièce',
    'No grooves.': 'Aucune rainure.',
    'Top view of the panel, <b>to scale</b>: the groove (%mark band) runs lengthwise, 10 mm from the <b>back</b> edge — tiny across the width (620−10−8). Through at one end, stopped at the other · depth given as a written dimension (invisible from above). Tick = grooved.': "Vue de dessus du panneau, <b>à l'échelle</b> : la rainure (%mark bande) court le long, à 10 mm du bord <b>arrière</b> — minuscule sur la largeur (620−10−8). Traversante d'un bout, arrêt de l'autre · profondeur en cote écrite (invisible de dessus). Cocher = rainurée.",
    'front': 'avant',
    'rear': 'arr.',
    'panel %len×%wid · groove width %gw · depth %gd mm · through ◀ stop ▶ %off': 'panneau %len×%wid · rainure largeur %gw · profondeur %gd mm · traversante ◀ arrêt ▶ %off',
    'Groove — width %gw · depth %gd mm': 'Rainure — largeur %gw · prof. %gd mm',
    'e.g. %role %len×%wid': 'ex. %role %len×%wid',
    'No lamello.': 'Aucun lamello.',
    'Plan per piece, <b>all at the same scale</b> — the slotted surfaces (end, edge, back face) folded out in aligned projection: the slot is a line there, the dimension is what counts. %blue In blue dashes</b>: the board that will be fitted, dimensioned from its reference edge — <b>a board against the stop reads 0</b>, the dimension you set on the shoe (never the slot axis). %bench ▬ bench</b>: on an edge, the face to lay on the bench — the lamello cutter measures from it. %dotShop ●</span> Tenso/Clamex · %dotWarn ◆</span> biscuit · %dotProj ▬</span> back groove.': "Plan par pièce, <b>tout à la même échelle</b> — les surfaces fendues (about, rive, contre-face) rabattues en projection alignée : la fente y est un trait, la cote fait foi. %blue En pointillé bleu</b> : la planche qui vient se poser, cotée depuis son bord de référence — <b>une planche en butée lit 0</b>, c'est la cote qu'on règle au sabot (jamais l'axe de la fente). %bench ▬ établi</b> : sur un chant, la face à poser sur le banc — la lamelleuse cote depuis elle. %dotShop ●</span> Tenso/Clamex · %dotWarn ◆</span> biscuit · %dotProj ▬</span> rainure fond.",
    'face': 'face',
    'back face': 'contre-face',
    'end L': 'ab. G',
    'end R': 'ab. D',
    'front edge': 'rive av.',
    'rear edge': 'rive ar.',
    '▬ bench': '▬ établi',
    'back face (seen through)': 'contre-face (par transparence)',
    'front↓': 'avant↓',
    'top: %face': 'haut : %face',
    '%n point': '%n points',
    '%n points': '%n points',
    'Assembly — <b>scene to scale</b> (open contract v0.2). Dimensions measured from the geometry; click a piece → detail; %tail': "Assemblage — <b>scène à l'échelle</b> (contrat ouvert v0.2). Cotes mesurées depuis la géométrie ; clic pièce → détail ; %tail",
    'click a step → pieces highlighted; tick each step.': 'clic étape → pièces surlignées ; cocher chaque étape.',
    'tick = assembled.': 'cocher = monté.',
    'Assembly sequence — %done/%total': 'Montage — %done/%total',
    'Assembled': 'Monté',
    'No assembly scene.': 'Pas de scène d’assemblage.',
    'Sheet %id · %state': 'Plaque %id · %state',
    '%n steps left': '%n étapes restantes',
    '%n step left': '%n étape restante',
    '✓ done': '✓ terminé',
    'No steps.': 'Aucune étape.',
    'Column %id': 'Colonne %id',
    'Sheet': 'Plaque',
    'Ripping': 'Refente',
    'guide %g · length %l mm': 'guide %g · longueur %l mm',
    'thk. %n': 'ép. %n',
    'Material': 'Matière',
    'Cross-cuts (%n)': 'Tronçons (%n)',
    'edges': 'chants',
    'Column to redo': 'Colonne à refaire',
    'Cut the column (%n) ✓': 'Débiter la colonne (%n) ✓',
    'Close': 'Fermer',
    'Dimensions': 'Dimensions',
    'Edges': 'Chants',
    'Top (assembled)': 'Haut (monté)',
    'Column': 'Colonne',
    '%entree · sheet %id': '%entree · plaque %id',
    'Preparations': 'Préparations',
    'on %face': 'sur %face',
    'Cut the column (%n pieces) ✓': 'Débiter la colonne (%n pièces) ✓',
    'Cut the column (%n piece) ✓': 'Débiter la colonne (%n pièce) ✓',
    'Done 🎉': 'Terminé 🎉',
    '%n step done': '%n étapes faites',
    '%n steps done': '%n étapes faites',
    'bands %list mm': 'bandes %list mm',
    'Sheet %id · %type': 'Plaque %id · %type',
    'DONE ✓': 'FAIT ✓',
    '▲ TOP': '▲ HAUT',
    '%n workbook': '%n workbook',
    '%n workbooks': '%n workbooks',
    '%done/%total steps': '%done/%total étapes',
  },
}

/**
 * The raw table, for the SHELL and for the tests.
 *
 * `view.js` hands it over as `words:` in what the factory returns, the way the
 * other plugins do, so the shell can say the manifest's own words in it too.
 */
export function table(locale) {
  return WORDS[String(locale ?? '').slice(0, 2)] ?? {}
}

/**
 * `t(key, values)` for one locale: the table's sentence or, failing that, the
 * key itself — visibly English beats blank — with `%name` filled in.
 */
export function makeT(locale) {
  const said = table(locale)
  return (key, values) => {
    const text = Object.hasOwn(said, key) ? said[key] : key
    if (!values) return text
    return text.replace(/%(\w+)/g, (whole, name) => (Object.hasOwn(values, name) ? String(values[name]) : whole))
  }
}
