export * from './contract.js'
export * from './permissions.js'
export * from './conformance.js'
export * from './claude-code/index.js'

/**
 * Namespaced, because both drivers legitimately define `TOKEN_ENV_VAR` and
 * `looksLikeToken` — one for a Claude subscription token, one for a GitHub
 * fine-grained one. Flattening them would force a rename that hides which
 * engine each belongs to, which is exactly the knowledge worth keeping.
 */
export * as copilot from './copilot-cli/index.js'
export { CopilotDriver, type CopilotDriverOptions } from './copilot-cli/driver.js'
