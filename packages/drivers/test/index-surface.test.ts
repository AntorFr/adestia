import { describe, expect, it } from 'vitest'
import * as index from '../src/index.js'
import { assertConformance } from '../src/conformance.js'

describe('the drivers index (R-6, AD-22)', () => {
  it('exposes_the_conformance_assertion_start_consumes_at_boot', () => {
    expect(typeof index.assertConformance).toBe('function')
    expect(index.assertConformance).toBe(assertConformance)
  })
})
