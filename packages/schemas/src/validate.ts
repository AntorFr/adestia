/**
 * Manifest validation — the loud refusal.
 *
 * The predecessor's rule, kept because it was right: a plugin you believe is
 * loaded but is not costs far more than one that is refused out loud. Every
 * refusal here names the field and says what was expected.
 *
 * Hand-written rather than driven by a JSON Schema runtime: the contract is
 * small and the error messages ARE the product — a plugin author reads them at
 * 2am. When external tooling needs a JSON Schema, it will be emitted from these
 * definitions rather than maintained beside them; one source of truth, always.
 */

import { PLUGIN_KINDS, PLUGIN_SCHEMA_VERSION, type PluginManifest } from './plugin.js'
import { SKIN_SCHEMA_VERSION, type SkinManifest } from './skin.js'

export interface ValidationIssue {
  readonly field: string
  readonly message: string
}

export class ManifestError extends Error {
  constructor(
    readonly what: string,
    readonly issues: readonly ValidationIssue[],
  ) {
    super(
      `Invalid ${what}:\n` + issues.map((i) => `  - ${i.field}: ${i.message}`).join('\n'),
    )
    this.name = 'ManifestError'
  }
}

type Raw = Record<string, unknown>

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkString(raw: Raw, field: string, issues: ValidationIssue[], required: boolean): void {
  const value = raw[field]
  if (value === undefined) {
    if (required) issues.push({ field, message: 'is required' })
    return
  }
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ field, message: 'must be a non-empty string' })
  }
}

function checkStringArray(raw: Raw, field: string, issues: ValidationIssue[]): void {
  const value = raw[field]
  if (value === undefined) return
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.length === 0)) {
    issues.push({ field, message: 'must be an array of non-empty strings' })
  }
}

/**
 * Relative, inside the folder, and not a URL. A manifest path is dereferenced
 * by the server and served to browsers; traversal here would be a file-read
 * primitive handed to whoever can drop a folder.
 */
function checkRelativePath(
  raw: Raw,
  field: string,
  issues: ValidationIssue[],
  folderWord = 'extension folder',
): void {
  const value = raw[field]
  if (value === undefined) return
  if (typeof value !== 'string' || value.length === 0) {
    issues.push({ field, message: 'must be a non-empty string' })
    return
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    issues.push({ field, message: 'must be a relative path, not a URL' })
    return
  }
  if (value.startsWith('/')) {
    issues.push({ field, message: `must be relative to the ${folderWord}` })
    return
  }
  if (value.split('/').includes('..')) {
    issues.push({ field, message: `must not escape the ${folderWord} ("..")` })
  }
}

function checkSchemaVersion(
  raw: Raw,
  expected: number,
  issues: ValidationIssue[],
): void {
  const value = raw['schemaVersion']
  if (value === undefined) {
    issues.push({ field: 'schemaVersion', message: `is required (expected ${expected})` })
    return
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.push({ field: 'schemaVersion', message: 'must be an integer' })
    return
  }
  if (value !== expected) {
    // Refused, never loaded sideways: a manifest from another era is a
    // different contract, and guessing which fields still mean the same thing
    // is how silent breakage starts.
    issues.push({
      field: 'schemaVersion',
      message: `is ${value}, this build understands ${expected}`,
    })
  }
}

/**
 * @param folderName the directory the manifest was found in. The folder wins:
 *   an `id` claiming otherwise is refused rather than silently re-mapped.
 */
export function parsePluginManifest(input: unknown, folderName: string): PluginManifest {
  const issues: ValidationIssue[] = []
  if (!isObject(input)) {
    throw new ManifestError(`plugin manifest for "${folderName}"`, [
      { field: '(root)', message: 'must be a JSON object' },
    ])
  }

  checkSchemaVersion(input, PLUGIN_SCHEMA_VERSION, issues)
  checkString(input, 'id', issues, true)
  checkString(input, 'description', issues, true)
  checkString(input, 'version', issues, false)

  if (typeof input['id'] === 'string' && input['id'] !== folderName) {
    issues.push({
      field: 'id',
      message: `is "${String(input['id'])}" but the folder is "${folderName}"`,
    })
  }

  const kind = input['kind']
  if (kind === undefined) {
    issues.push({ field: 'kind', message: 'is required' })
  } else if (typeof kind !== 'string' || !(PLUGIN_KINDS as readonly string[]).includes(kind)) {
    // An unknown kind does not fall back to a default: a plugin whose
    // activation rule nobody knows is a plugin nobody can reason about.
    issues.push({
      field: 'kind',
      message: `must be one of ${PLUGIN_KINDS.join(', ')}`,
    })
  }

  for (const field of ['view', 'blocks', 'chrome', 'api', 'setup']) {
    checkRelativePath(input, field, issues, 'plugin folder')
  }
  for (const field of ['styles', 'bin', 'skills', 'types', 'absorbs']) {
    checkStringArray(input, field, issues)
  }
  for (const [index, style] of (Array.isArray(input['styles']) ? input['styles'] : []).entries()) {
    if (typeof style === 'string') {
      checkRelativePath({ [`styles[${index}]`]: style }, `styles[${index}]`, issues, 'plugin folder')
    }
  }

  if (input['tile'] !== undefined) {
    if (!isObject(input['tile'])) {
      issues.push({ field: 'tile', message: 'must be an object' })
    } else {
      checkString(input['tile'], 'label', issues, true)
    }
  }

  const servers = input['mcpServers']
  if (servers !== undefined) {
    if (!Array.isArray(servers)) {
      issues.push({ field: 'mcpServers', message: 'must be an array' })
    } else {
      for (const [index, server] of servers.entries()) {
        const field = `mcpServers[${index}]`
        if (!isObject(server)) {
          issues.push({ field, message: 'must be an object' })
          continue
        }
        checkString(server, 'name', issues, true)
        if (server['command'] === undefined && server['url'] === undefined) {
          issues.push({ field, message: 'needs either "command" (stdio) or "url" (http)' })
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new ManifestError(`plugin manifest for "${folderName}"`, issues)
  }
  return input as unknown as PluginManifest
}

export function parseSkinManifest(input: unknown, folderName: string): SkinManifest {
  const issues: ValidationIssue[] = []
  if (!isObject(input)) {
    throw new ManifestError(`skin manifest for "${folderName}"`, [
      { field: '(root)', message: 'must be a JSON object' },
    ])
  }

  checkSchemaVersion(input, SKIN_SCHEMA_VERSION, issues)
  checkString(input, 'id', issues, true)
  checkString(input, 'description', issues, true)

  if (typeof input['id'] === 'string' && input['id'] !== folderName) {
    issues.push({
      field: 'id',
      message: `is "${String(input['id'])}" but the folder is "${folderName}"`,
    })
  }

  for (const field of ['module', 'styles', 'icon', 'manifest']) {
    checkRelativePath(input, field, issues, 'skin folder')
  }

  const scheme = input['scheme']
  if (scheme !== undefined && scheme !== 'light' && scheme !== 'dark' && scheme !== 'auto') {
    // Refused rather than defaulted: a skin that believes it declared "dark"
    // and silently got "auto" is a skin whose colours look wrong on half the
    // machines that open it.
    issues.push({ field: 'scheme', message: 'must be "light", "dark" or "auto"' })
  }

  if (issues.length > 0) {
    throw new ManifestError(`skin manifest for "${folderName}"`, issues)
  }
  return input as unknown as SkinManifest
}
