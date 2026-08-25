/**
 * Who owns a folder, and where a link to it goes.
 *
 * The defect this exists for, in one sentence: `absorbs` said the trips app
 * stands for `voyages/`, and every link into a trip ignored it — the
 * breadcrumb out of one of its pages walked back to a generic list of files.
 * So the cases below are all about the SAME question asked from different
 * screens, plus the two the shell must refuse to answer: a plugin with no
 * address, and a plugin trying to route somewhere that is not its own.
 */

import { describe, expect, it, vi } from 'vitest'

import type { LoadedPlugin } from '../src/plugins/loader.js'
import {
  addressOf,
  decodePath,
  encodePath,
  folderRoute,
  ownerOf,
  routeForPath,
  sectionRoute,
} from '../src/app/owners.js'

const component = (() => null) as unknown as LoadedPlugin['view'] extends undefined
  ? never
  : NonNullable<LoadedPlugin['view']>['component']

function plugin(shape: {
  id: string
  absorbs?: string[]
  route?: string
  tile?: boolean
  routeFor?: (folder: string) => string | undefined
}): LoadedPlugin {
  return {
    id: shape.id,
    base: `/plugins/${shape.id}/`,
    ...(shape.absorbs ? { absorbs: shape.absorbs } : {}),
    ...(shape.tile ? { tile: { label: shape.id } } : {}),
    view: {
      component,
      ...(shape.route ? { route: shape.route } : {}),
      ...(shape.routeFor ? { routeFor: shape.routeFor } : {}),
    },
  }
}

/** The trips app as it actually ships: absorbs a name, routes by asset path. */
const voyages = plugin({
  id: 'voyages',
  absorbs: ['voyages'],
  route: '/voyages',
  tile: true,
  routeFor: (folder) =>
    folder.endsWith('broceliande-2026')
      ? `/voyages/${encodeURIComponent(`${folder}/assets/voyage.json`)}`
      : undefined,
})

describe('a folder a plugin absorbs', () => {
  it('opens on the plugin screen, not on the generic section', () => {
    // The bug, exactly: from a page of the trip, the crumb above it.
    expect(routeForPath([voyages], 'domaines/voyages/broceliande-2026')).toBe(
      '/voyages/domaines%2Fvoyages%2Fbroceliande-2026%2Fassets%2Fvoyage.json',
    )
  })

  it('is found wherever the operator filed it', () => {
    // `absorbs` is a NAME: the same plugin, a workspace that never heard of
    // `domaines/`.
    expect(ownerOf([voyages], 'voyages/broceliande-2026')?.id).toBe('voyages')
    expect(ownerOf([voyages], 'archives/voyages/broceliande-2026')?.id).toBe('voyages')
  })

  it('never claims a folder that merely starts with the same letters', () => {
    expect(ownerOf([voyages], 'domaines/mes-voyages')).toBeUndefined()
    expect(folderRoute([voyages], 'domaines/mes-voyages')).toBe('/section/domaines/mes-voyages')
  })

  it('falls back to the plugin route for the absorbed folder ITSELF', () => {
    // No `routeFor` answer needed: a tile that stands for a folder IS its
    // address. `#/section/domaines/voyages` would have listed the trips as
    // files beside an app that draws them as trips.
    expect(routeForPath([voyages], 'domaines/voyages')).toBe('/voyages')
  })

  it('falls back to the generic section when the plugin has no screen for it', () => {
    // A notes folder filed under `voyages/` that is not a trip. Answering
    // "unreadable trip" would be worse than the honest generic list.
    expect(routeForPath([voyages], 'domaines/voyages/idees')).toBeUndefined()
    expect(folderRoute([voyages], 'domaines/voyages/idees')).toBe('/section/domaines/voyages/idees')
  })
})

describe('what the shell refuses to route', () => {
  it('drops an answer outside the plugin’s own route', () => {
    // Owning a folder is not owning the shell's navigation.
    const greedy = plugin({
      id: 'greedy',
      absorbs: ['stuff'],
      route: '/greedy',
      routeFor: () => '/settings',
    })
    expect(routeForPath([greedy], 'stuff/here')).toBeUndefined()
  })

  it('survives a plugin whose routeFor throws', () => {
    const broken = plugin({
      id: 'broken',
      absorbs: ['stuff'],
      route: '/broken',
      routeFor: () => {
        throw new Error('nope')
      },
    })
    const complained = vi.spyOn(console, 'error').mockImplementation(() => {})
    // It costs the shortcut, never the breadcrumb drawing it: this runs
    // mid-render.
    expect(folderRoute([broken], 'stuff/here')).toBe('/section/stuff/here')
    expect(complained).toHaveBeenCalled()
    complained.mockRestore()
  })

  it('leaves a folder alone when nothing absorbs it', () => {
    expect(routeForPath([voyages], 'domaines/diy')).toBeUndefined()
    expect(folderRoute([], 'domaines/diy')).toBe(sectionRoute('domaines/diy'))
  })
})

describe('a plugin that owns a path without declaring anything', () => {
  // The atelier: its benches sit in whatever project folders exist, and no
  // folder NAME covers them. It claims a path by knowing it.
  const atelier = plugin({
    id: 'atelier',
    route: '/atelier',
    tile: true,
    routeFor: (path) =>
      path.startsWith('domaines/diy/projets/rangement-garage')
        ? '/atelier/rangement-garage'
        : undefined,
  })

  it('is asked, and answers, with no absorbs anywhere', () => {
    expect(routeForPath([atelier], 'domaines/diy/projets/rangement-garage')).toBe(
      '/atelier/rangement-garage',
    )
  })

  it('leaves alone the folder next door', () => {
    // A folder of notes is not a workbench because it sits under `diy`.
    expect(routeForPath([atelier], 'domaines/diy/machines')).toBeUndefined()
    expect(folderRoute([atelier], 'domaines/diy/machines')).toBe('/section/domaines/diy/machines')
  })

  it('never overrides a plugin that DECLARED the folder', () => {
    // Declared beats known: an explicit claim is not taken by a plugin
    // volunteering an answer.
    const greedy = plugin({
      id: 'greedy',
      route: '/greedy',
      tile: true,
      routeFor: () => '/greedy/anything',
    })
    expect(routeForPath([greedy, voyages], 'domaines/voyages/broceliande-2026')).toBe(
      '/voyages/domaines%2Fvoyages%2Fbroceliande-2026%2Fassets%2Fvoyage.json',
    )
    // …and the declared owner answering nothing does not hand the folder to
    // the volunteer either: it is claimed, and that is the end of it.
    expect(routeForPath([greedy, voyages], 'domaines/voyages/idees')).toBeUndefined()
  })
})

describe('how a path is written into a route', () => {
  it('escapes segments and leaves the slashes alone', () => {
    // `#/section/domaines%2Fvoyages` escaped the one character a fragment
    // always allowed, and made every shell URL unreadable for nothing.
    expect(encodePath('domaines/voyages/été 2026')).toBe('domaines/voyages/%C3%A9t%C3%A9%202026')
    expect(sectionRoute('domaines/diy')).toBe('/section/domaines/diy')
  })

  it('reads back BOTH spellings, so no written link dies', () => {
    expect(decodePath('domaines/voyages/baden-2026')).toBe('domaines/voyages/baden-2026')
    expect(decodePath('domaines%2Fvoyages%2Fbaden-2026')).toBe('domaines/voyages/baden-2026')
    // A stray percent somebody typed is read as itself, never thrown.
    expect(decodePath('100%')).toBe('100%')
  })
})

describe('a plugin’s address', () => {
  it('is the declared route when there is one', () => {
    expect(addressOf(voyages)).toBe('/voyages')
  })

  it('is `/<id>` for a tiled plugin that declares none', () => {
    // The todo app: it absorbs `todo/` and never declared a route, so its
    // folder resolved to nothing until the shell's own tile rule was used
    // here too.
    const todo = plugin({ id: 'todo', absorbs: ['todo'], tile: true })
    expect(addressOf(todo)).toBe('/todo')
    expect(routeForPath([todo], 'todo')).toBe('/todo')
  })

  it('is nothing at all for a view with neither', () => {
    const hidden = plugin({ id: 'hidden', absorbs: ['hidden'] })
    expect(addressOf(hidden)).toBeUndefined()
    // A view reached only from its tile has no address to link to, so the
    // folder keeps the section screen rather than pointing nowhere.
    expect(routeForPath([hidden], 'hidden/deep')).toBeUndefined()
  })
})

describe('two plugins over one folder', () => {
  it('gives it to the most specific claim, whatever the load order', () => {
    const broad = plugin({ id: 'broad', absorbs: ['voyages'], route: '/broad', tile: true })
    const narrow = plugin({
      id: 'narrow',
      absorbs: ['voyages/archives'],
      route: '/narrow',
      tile: true,
    })
    expect(ownerOf([broad, narrow], 'voyages/archives/2019')?.id).toBe('narrow')
    expect(ownerOf([narrow, broad], 'voyages/archives/2019')?.id).toBe('narrow')
    // And the broad one still owns what the narrow one never claimed.
    expect(ownerOf([narrow, broad], 'voyages/corse')?.id).toBe('broad')
  })
})
