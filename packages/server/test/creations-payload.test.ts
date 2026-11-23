import { describe, expect, it } from 'vitest'

import { parsePluginManifest } from '@antorfr/adestia-schemas'

import { frontendPayload, type DiscoveredPlugin } from '../src/extensions.js'

const creations = [{ id: 'meeting', label: 'Meeting', line: 'A note.', action: { template: 'templates/meeting.md' } }]
const plugin = (id: string, active: boolean, extra: object = {}): DiscoveredPlugin => ({
  manifest: parsePluginManifest({ schemaVersion: 1, id, kind: 'feature', description: 'd', ...extra }, id),
  dir: `/x/${id}`,
  active,
})

describe('creations in the frontend payload', () => {
  it('sends them for an active plugin, unchanged', () => {
    expect(frontendPayload([plugin('seeds', true, { creations })])[0]?.creations).toEqual(creations)
  })
  it('sends nothing for the same plugin switched off', () => {
    expect(frontendPayload([plugin('seeds', false, { creations })])).toEqual([])
  })
  it('omits the key when the plugin declares none', () => {
    expect(frontendPayload([plugin('seeds', true)])[0]).not.toHaveProperty('creations')
  })
})
