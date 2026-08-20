/**
 * Mechanical driver conformance — the checks a driver must pass before the
 * core will load it.
 *
 * Why this exists as code rather than a checklist: a driver that *declares*
 * `usageMetrics` and does not deliver it produces no symptom until a user
 * stares at an empty panel and blames the product. Declaration and
 * implementation are checked against each other, loudly, at load time.
 */

import {
  CAPABILITY_METHODS,
  CAPABILITY_REQUIRES,
  isCapability,
  type Capability,
  type DriverDescriptor,
} from './contract.js'

/** Methods of the mandatory core — a driver missing any of them is not a driver. */
const CORE_METHODS = ['describe', 'env', 'runTurn', 'interrupt'] as const

export interface ConformanceIssue {
  readonly kind: 'missing-core-method' | 'unknown-capability' | 'missing-method' | 'missing-prerequisite'
  readonly detail: string
}

/**
 * Checks a driver instance against its own descriptor.
 * Returns every issue found — not just the first: a driver author fixing one
 * problem per run is a driver author who gives up.
 */
export function checkConformance(
  driver: object,
  descriptor: DriverDescriptor,
): readonly ConformanceIssue[] {
  const issues: ConformanceIssue[] = []
  const has = (name: string): boolean =>
    typeof (driver as Record<string, unknown>)[name] === 'function'

  for (const method of CORE_METHODS) {
    if (!has(method)) {
      issues.push({ kind: 'missing-core-method', detail: method })
    }
  }

  const declared = new Set<Capability>()
  for (const raw of descriptor.capabilities) {
    if (!isCapability(raw)) {
      issues.push({ kind: 'unknown-capability', detail: raw })
      continue
    }
    declared.add(raw)
  }

  for (const capability of declared) {
    for (const method of CAPABILITY_METHODS[capability]) {
      if (!has(method)) {
        issues.push({
          kind: 'missing-method',
          detail: `${capability} requires ${method}()`,
        })
      }
    }
    const prerequisite = CAPABILITY_REQUIRES[capability]
    if (prerequisite && !declared.has(prerequisite)) {
      issues.push({
        kind: 'missing-prerequisite',
        detail: `${capability} requires ${prerequisite}`,
      })
    }
  }

  return issues
}

export function assertConformance(driver: object, descriptor: DriverDescriptor): void {
  const issues = checkConformance(driver, descriptor)
  if (issues.length > 0) {
    const lines = issues.map((i) => `  - [${i.kind}] ${i.detail}`).join('\n')
    throw new Error(`Driver "${descriptor.id}" is not conformant:\n${lines}`)
  }
}
