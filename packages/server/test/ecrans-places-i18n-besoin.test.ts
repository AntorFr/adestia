import { describe, expect, it } from 'vitest'
// @ts-expect-error: plain ESM script without types
import { calcul } from '../../../scripts/niveaux.mjs'

// Besoin (fiche ecrans-places-i18n, AD-ecrans-places-6): i18n.ts is placed by the keys whose entry
// changed, read in the FR and en tables; only the screens whose sources cite a key play.

const I18N = 'packages/web/src/app/i18n.ts'
const MAP = {
  ecrans: {
    'E-1': { entrees: ['packages/web/src/app/Gates.tsx'] },
    'E-2': { entrees: ['packages/web/src/app/Home.tsx'] },
    'E-15': { entrees: ['packages/web/src/app/SettingsMenu.tsx'] },
  },
  tests: { 'packages/web/test/a-browser.test.ts': ['E-1'] },
}
const TOUS = ['E-1', 'E-15', 'E-2']
const TEXTES: Record<string, string[]> = {
  'E-1': ["t('Sign in')", 'x = "Sign out"'],
  'E-2': ["t('Home')", "t('Sign in')"],
  'E-15': ["t('Settings')"],
}

const fichier = (fr: string, en: string, code = 'export const x = 1\n') => `${code}
// a comment
const FR: Readonly<Record<string, string>> = {
${fr}
}

const TABLES: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {
${en}
  },
}
`
const FR0 = `  'Sign in': 'Connexion',
  'Settings':
    'Réglages',
  'Home': 'Accueil',
  'Server only': 'Message du serveur',`
const EN0 = `    'Sign in': 'Sign in',
    'Settings': 'Settings',`
const BASE = fichier(FR0, EN0)

const cas = (apres: string, avant = BASE) => {
  const { touches: t } = calcul([I18N], MAP, {
    ancien: () => avant,
    actuel: () => apres,
    textes: (id: string) => TEXTES[id] ?? [],
  })
  return [...t].sort()
}

describe('i18n.ts (AD-ecrans-places-6)', () => {
  it('une clé citée par un seul écran ne touche que lui', () =>
    expect(cas(BASE.replace("'Réglages'", "'Paramètres'"))).toEqual(['E-15']))
  it('une valeur sur la ligne suivante est lue', () =>
    expect(cas(BASE.replace("'Accueil'", "'Maison'"))).toEqual(['E-2']))
  it('une clé citée par deux écrans les touche tous deux (guillemets doubles lus)', () =>
    expect(cas(BASE.replace("'Connexion'", "'Se connecter'"))).toEqual(['E-1', 'E-2']))
  it('la table en est lue aussi', () =>
    expect(cas(BASE.replace("'Settings': 'Settings'", "'Settings': 'Setup'"))).toEqual(['E-15']))
  it('une clé ajoutée touche son écran', () =>
    expect(cas(BASE.replace("  'Home':", "  'Sign out': 'Déconnexion',\n  'Home':"))).toEqual(['E-1']))
  it('une clé retirée touche son écran', () =>
    expect(cas(BASE.replace("  'Home': 'Accueil',\n", ''))).toEqual(['E-2']))
  it('deux clés de deux écrans: l’union', () =>
    expect(cas(BASE.replace("'Réglages'", "'R'").replace("'Accueil'", "'A'"))).toEqual(['E-15', 'E-2']))
  it('une clé citée nulle part touche tous', () =>
    expect(cas(BASE.replace("'Message du serveur'", "'Autre'"))).toEqual(TOUS))
  it('une clé citée nulle part, mêlée à une clé citée, touche tous', () =>
    expect(cas(BASE.replace("'Message du serveur'", "'Autre'").replace("'Accueil'", "'A'"))).toEqual(TOUS))
  it('un changement de code (identifiant) touche tous', () =>
    expect(cas(BASE.replace('const x = 1', 'const y = 1'))).toEqual(TOUS))
  it('un changement de littéral numérique dans le code touche tous', () =>
    expect(cas(BASE.replace('x = 1', 'x = 2'))).toEqual(TOUS))
  it('un changement de gabarit (template literal) dans le code touche tous', () =>
    expect(cas(fichier(FR0, EN0, 'export const x = `a`\n'), fichier(FR0, EN0, 'export const x = `b`\n'))).toEqual(TOUS))
  it('un commentaire changé ne touche rien', () =>
    expect(cas(BASE.replace('// a comment', '/* autre\n { \'Home\': \'x\' } */').replace("'Accueil',", "'Accueil', // note"))).toEqual([]))
  it('une espace ou un retour à la ligne changé ne touche rien', () =>
    expect(cas(BASE.replace("'Home': 'Accueil'", "'Home':\n    'Accueil'"))).toEqual([]))
  it('un fichier identique ne touche rien', () => expect(cas(BASE)).toEqual([]))
  it('une entrée non comprise touche tous', () =>
    expect(cas(BASE.replace("'Home': 'Accueil'", "'Home': `Accueil`"))).toEqual(TOUS))
  it('une version de base absente touche tous', () => {
    const { touches: t } = calcul([I18N], MAP, { ancien: () => null, actuel: () => BASE, textes: () => [] })
    expect([...t].sort()).toEqual(TOUS)
  })
  it('i18n.ts ne se cite pas lui-même: un écran qui l’atteint ne cite pas toutes les clés', () =>
    expect(cas(BASE.replace("'Réglages'", "'P'"))).toEqual(['E-15']))
})
