/**
 * Le côté serveur d'un parcours : une frontière et un assemblage.
 *
 * La frontière d'abord, parce que c'est elle qui protège l'espace de travail —
 * un plugin qui monte des GPX ne doit pas devenir une façon de lire n'importe
 * quel fichier. L'assemblage ensuite : le GPX est un DÉRIVÉ, donc son exactitude
 * ne se vérifie nulle part ailleurs que dans un banc.
 */

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { join, sep } from 'node:path'

import { buildGpx, decode, parcoursName } from '../api.mjs'

const ROOT = `${sep}pages`

test('un nom de parcours ne sort pas de l’espace de travail', () => {
  // Un NOM logique entre, un nom logique sort : où le fichier vit est
  // l'affaire du noyau, qui compose les magasins et applique la garde chez
  // chacun. Ce plugin ne connaît plus de racine.
  assert.equal(
    parcoursName('domaines/voyages/x/assets/val.parcours.json'),
    'domaines/voyages/x/assets/val.parcours.json',
  )
  // La traversée, sous toutes ses formes.
  assert.equal(parcoursName('../../etc/passwd.parcours.json'), undefined)
  assert.equal(parcoursName('x/\0.parcours.json'), undefined)
  assert.equal(parcoursName(''), undefined)
  assert.equal(parcoursName(42), undefined)
  // Une barre de tête est RAMENÉE dans la racine plutôt que refusée — même
  // règle que chez les voyages : `/x.parcours.json` est une façon maladroite
  // d'écrire un chemin relatif, pas une tentative de sortir.
  assert.equal(parcoursName('/x.parcours.json'), 'x.parcours.json')
})

test('le suffixe est vérifié, pas seulement le chemin', () => {
  // Sans ça, cette route servirait n'importe quel fichier de l'espace de
  // travail à qui sait écrire une chaîne de requête.
  assert.equal(parcoursName('domaines/prive/salaires.json'), undefined)
  assert.equal(parcoursName('domaines/prive/notes.md'), undefined)
  assert.equal(parcoursName('x.parcours.json.bak'), undefined)
})

test('decode rend la trace et les altitudes avec le même algorithme', () => {
  // Deux dimensions au facteur 1e5 pour un couple lat,lng…
  const points = decode('_p~iF~ps|U_ulLnnqC')
  assert.equal(points.length, 2)
  assert.ok(Math.abs(points[0][0] - 38.5) < 1e-6)
  assert.ok(Math.abs(points[0][1] + 120.2) < 1e-6)
  // …une seule au facteur 1 pour une altitude en mètres entiers. Le préfixe
  // réel d'un fichier de parcours : 194 m, puis deux mètres de moins, puis
  // quatre. Un facteur 1e5 rendrait 0,00194 m, ce qui est le genre de silence
  // qu'un profil altimétrique plat ne permet pas de diagnostiquer.
  assert.deepEqual(decode('cKBF', 1, 1), [[194], [192], [188]])
})

const parcours = {
  titre: 'Boucle du val',
  desc: 'Depuis le gîte.',
  reperes: [
    {
      nom: "L'Hotié",
      latlng: '48.002,-2.256',
      desc: 'Le coffre mégalithique.',
      note: 'Plein soleil.',
      web: 'https://example.org/a?b=1&c=2',
      sym: 'Monument',
    },
    { nom: 'Sans coordonnée' },
  ],
  trace: {
    geometrie: '_p~iF~ps|U_ulLnnqC',
    altitudes: 'cKB',
    distance_m: 6384,
    denivele_pos_m: 196,
    calcule_le: '2026-08-09',
    moteur: 'BRouter',
    altimetrie: 'IGN RGE ALTI',
  },
}

test('le GPX porte les repères, le chemin et ses altitudes', () => {
  const gpx = buildGpx(parcours)
  assert.match(gpx, /<name>Boucle du val<\/name>/)
  assert.match(gpx, /6\.38 km, 2 repères, D\+ 196 m/)
  // La prose de l'agent d'abord, les chiffres ensuite.
  assert.ok(gpx.indexOf('Depuis le gîte.') < gpx.indexOf('6.38 km'))
  // `desc` ET `note` dans le même champ : un lecteur de GPX n'en a qu'un, et
  // perdre la note serait perdre ce que l'agent a ajouté de sa main.
  assert.match(gpx, /Le coffre mégalithique\.\n\nPlein soleil\./)
  assert.match(gpx, /<link href="https:\/\/example\.org\/a\?b=1&amp;c=2">/)
  assert.match(gpx, /<sym>Monument<\/sym>/)
  assert.equal((gpx.match(/<trkpt /g) ?? []).length, 2)
  assert.equal((gpx.match(/<ele>/g) ?? []).length, 2)
})

test('un repère sans coordonnée lisible est omis, pas inventé', () => {
  // Les deux repères sont dans le fichier, un seul peut devenir un point.
  assert.equal((buildGpx(parcours).match(/<wpt /g) ?? []).length, 1)
})

test('un parcours sans trace le DIT plutôt que de laisser croire à un chemin', () => {
  const gpx = buildGpx({ ...parcours, trace: {} })
  assert.match(gpx, /AUCUNE trace calculée/)
  // Beaucoup d'applications refusent un fichier sans `<trk>` : il ne faut pas
  // en fabriquer un vide, il faut annoncer l'absence.
  assert.ok(!gpx.includes('<trk>'))
})

test('le texte d’un repère ne peut pas casser le XML', () => {
  const gpx = buildGpx({
    titre: '<script>alert(1)</script>',
    reperes: [{ nom: 'A & B', latlng: '1,2', desc: '<b>gras</b>', web: 'https://x/?a="b"' }],
  })
  assert.match(gpx, /<name>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/name>/)
  assert.match(gpx, /<name>1\. A &amp; B<\/name>/)
  assert.match(gpx, /<desc>&lt;b&gt;gras&lt;\/b&gt;<\/desc>/)
  // Un guillemet dans une valeur d'attribut, lui, doit partir — il fermerait
  // l'attribut. Dans du TEXTE il n'a rien à craindre et reste lisible.
  assert.match(gpx, /href="https:\/\/x\/\?a=&quot;b&quot;"/)
})
