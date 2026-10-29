/** English keys, with the original French preserved verbatim. */
const FR = {
  "Start and finish": "Départ et arrivée",
  "Start": "Départ",
  "Finish": "Arrivée",
  "Zoom in": "Zoomer",
  "Zoom out": "Dézoomer",
  "Fit the route": "Recadrer sur le parcours",
  "Waiting for GPS…": "En attente du GPS…",
  "Follow": "Suivi",
  "Leave walking mode": "Quitter le mode balade",
  "This browser cannot provide your position.": "Ce navigateur ne donne pas la position.",
  "Off route — progress is meaningless here.": "Hors trace — l’avancement ne veut rien dire ici.",
  "Last waypoint reached.": "Dernier repère atteint.",
  "Position denied — allow it in your browser.": "Position refusée — autorisez-la dans le navigateur.",
  "Position unavailable for now.": "Position indisponible pour l’instant.",
  "Change map background": "Changer de fond de carte",
  "Walking mode": "Mode balade",
  "Full screen, your position, the walk ahead": "Plein écran, votre position, ce qui reste à marcher",
  "↓ Download GPX": "↓ Télécharger le GPX",
  "The route, for Organic Maps, OsmAnd…": "La trace, pour Organic Maps, OsmAnd…",
  "No points to display.": "Aucun point à afficher.",
  "unknown router": "routeur inconnu",
  "Route": "Parcours",
  "route not calculated yet": "trace pas encore calculée",
  "© IGN — Geoplateforme": "© IGN — Géoplateforme",
  "© OpenStreetMap contributors": "© les contributeurs OpenStreetMap",
  "Waypoint %n": "Repère %n",
  "Elevation profile over %distance: from %min to %max metres, %n waypoints.": "Profil altimétrique sur %distance : de %min à %max mètres, %n repères.",
  "%distance since the previous waypoint": "%distance depuis le précédent",
  "%offset m from the route": "à %offset m de la trace",
  "%distance m from the route": "À %distance m du parcours",
  "%done of %total": "%done sur %total",
  "%duration walking": "%duration de marche",
  "%distance m of stairs": "%distance m d'escaliers",
  "%n waypoint": "%n repère",
  "%n waypoints": "%n repères",
  "Route calculated on %date — %router.": "Trace calculée le %date — %router.",
  "Unreadable route: %message": "Parcours illisible : %message",
  "Route…": "Parcours…",
  "No route in this address.": "Aucun parcours dans cette adresse.",
  "In ": "Dans ",
  "A walk, drawn from the `.parcours.json` that sits beside the page.": "Un parcours, dessiné depuis le `.parcours.json` posé à côté de la fiche."
}

export function table(locale) {
  return String(locale ?? '').slice(0, 2) === 'fr' ? FR : {}
}

export function makeT(locale) {
  const words = table(locale)
  return (key, values) => {
    const text = Object.hasOwn(words, key) ? words[key] : key
    return text.replace(/%(\w+)/g, (whole, name) =>
      values && Object.hasOwn(values, name) ? String(values[name]) : whole)
  }
}
