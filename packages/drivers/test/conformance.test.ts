import { describe, expect, it } from 'vitest'

import { assertConformance, checkConformance } from '../src/conformance.js'
import { CAPABILITIES, isCapability, type DriverDescriptor } from '../src/contract.js'

/** A driver reduced to its mandatory core — the smallest conformant thing. */
function coreDriver(): Record<string, unknown> {
  return {
    describe: () => Promise.resolve(descriptor([])),
    env: () => Promise.resolve({}),
    runTurn: () => ({ [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }) }),
    interrupt: () => Promise.resolve(),
  }
}

function descriptor(capabilities: readonly string[]): DriverDescriptor {
  return {
    id: 'test-cli',
    label: 'Test CLI',
    cliVersion: '0.0.0',
    capabilities: capabilities as DriverDescriptor['capabilities'],
  }
}

describe('capability vocabulary', () => {
  it('is closed', () => {
    expect(isCapability('usageMetrics')).toBe(true)
    expect(isCapability('telepathy')).toBe(false)
  })

  it('lists every capability the design promises', () => {
    expect([...CAPABILITIES].sort()).toEqual(
      [
        'authManagement',
        'contextBreakdown',
        'cost',
        'liveTurnUsage',
        'mcpStatus',
        'modelSelection',
        'subscriptionQuotas',
        'usageMetrics',
      ].sort(),
    )
  })
})

describe('checkConformance', () => {
  it('accepts a driver that declares nothing beyond the core', () => {
    expect(checkConformance(coreDriver(), descriptor([]))).toEqual([])
  })

  it('reports every missing core method, not just the first', () => {
    const issues = checkConformance({ describe: () => {} }, descriptor([]))
    expect(issues.map((i) => i.detail)).toEqual(['env', 'runTurn', 'interrupt'])
  })

  it('refuses an unknown capability instead of ignoring it', () => {
    const issues = checkConformance(coreDriver(), descriptor(['telepathy']))
    expect(issues).toEqual([{ kind: 'unknown-capability', detail: 'telepathy' }])
  })

  it('catches a capability declared but not implemented', () => {
    const issues = checkConformance(coreDriver(), descriptor(['modelSelection']))
    expect(issues).toEqual([
      { kind: 'missing-method', detail: 'modelSelection requires listModels()' },
    ])
  })

  it('accepts the same capability once implemented', () => {
    const driver = { ...coreDriver(), listModels: () => Promise.resolve([]) }
    expect(checkConformance(driver, descriptor(['modelSelection']))).toEqual([])
  })

  it('requires the whole authManagement method set', () => {
    const driver = { ...coreDriver(), authStatus: () => Promise.resolve({}) }
    const issues = checkConformance(driver, descriptor(['authManagement']))
    expect(issues.map((i) => i.detail)).toEqual([
      'authManagement requires beginAuth()',
      'authManagement requires completeAuth()',
      'authManagement requires cancelAuth()',
    ])
  })

  it('rejects a usage refinement declared without usageMetrics', () => {
    // A climbing token counter with no usage contract behind it is a lie.
    const issues = checkConformance(coreDriver(), descriptor(['liveTurnUsage']))
    expect(issues).toEqual([
      { kind: 'missing-prerequisite', detail: 'liveTurnUsage requires usageMetrics' },
    ])
  })

  it('accepts the refinement when its prerequisite is declared too', () => {
    const issues = checkConformance(coreDriver(), descriptor(['usageMetrics', 'liveTurnUsage']))
    expect(issues).toEqual([])
  })
})

describe('assertConformance', () => {
  it('names the driver and every issue in one throw', () => {
    expect(() => assertConformance(coreDriver(), descriptor(['modelSelection', 'nope']))).toThrow(
      /Driver "test-cli" is not conformant/,
    )
    expect(() => assertConformance(coreDriver(), descriptor(['modelSelection', 'nope']))).toThrow(
      /unknown-capability/,
    )
  })

  it('stays silent when everything checks out', () => {
    expect(() => assertConformance(coreDriver(), descriptor([]))).not.toThrow()
  })
})
