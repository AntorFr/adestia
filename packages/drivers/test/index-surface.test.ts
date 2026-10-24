import { describe, expect, it } from 'vitest'
import * as index from '../src/index.js'
import { assertConformance } from '../src/conformance.js'

describe('the drivers index (R-6)', () => {
  it('does_not_expose_the_test_only_conformance_assertion', () => {
    expect('assertConformance' in index).toBe(false)
    expect(typeof assertConformance).toBe('function')
  })
})
