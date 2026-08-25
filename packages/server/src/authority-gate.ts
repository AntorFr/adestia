/**
 * The authority gate — a turn may not change what a turn is allowed to do.
 *
 * Some files in a workspace are not documents. A permission list, a hook, the
 * MCP wiring, a sandbox switch: each of them decides what the agent is ABLE to
 * do, so an agent editing one is an agent editing its own leash. That is not a
 * hypothetical — an agent asked to "make this work" will reach for the setting
 * that is in its way, entirely in good faith.
 *
 * So every write to the zone asks a person. Not "usually", and not "unless the
 * tools are trusted": the rule's `ask` is consulted BEFORE `autoAllow`, which
 * is what lets an instance trust its file tools everywhere else and still stop
 * here. Unattended — a scheduled turn, an MCP delegation — there is nobody to
 * ask, and the unattended policy already answers deny.
 *
 * WHERE the zone is comes from the DRIVER, never from this file: the two CLIs
 * carry the same natures under different names and their zones overlap without
 * matching, so a hardcoded path would be right about one and wrong about the
 * other.
 *
 * ⚠️ WHAT THIS DOES NOT COVER, stated here because it is the thing somebody
 * will otherwise assume. This gate sees FILE EDITS — the calls a driver can
 * normalize into "this path, this content". A shell command that rewrites the
 * same file (`sed -i`, a redirect) is not one of those, and follows the
 * name-based policy alone. On an instance that auto-allows `Bash`, this gate
 * is open and no content rule can close it. The real wall for that is an
 * agent running as another user against a store it cannot reach — a feature in
 * its own right, not something obtained sideways.
 */

import { resolve, sep } from 'node:path'

import type { EditRuling, ProposedFileEdit } from '@antorfr/golem-drivers'

/**
 * Builds the rule from the driver's declared paths.
 *
 * A path covers everything beneath it, so naming a folder guards the files it
 * will hold tomorrow as well as the ones in it today — which matters most for
 * hook directories, where the dangerous file is precisely the one that does
 * not exist yet.
 */
export function authorityEditRule(
  workspaceRoot: string,
  paths: readonly string[],
): (edit: ProposedFileEdit) => EditRuling {
  const zones = paths.map((path) => resolve(workspaceRoot, path))

  return (edit) => {
    const target = resolve(edit.path)
    const guarded = zones.some((zone) => target === zone || target.startsWith(zone + sep))
    // `undefined` rather than `allow` outside the zone: this rule has nothing
    // to say there, and saying `allow` would override a policy that does.
    return guarded ? 'ask' : undefined
  }
}

/**
 * Chains content rules, first answer wins.
 *
 * `decideEdit` is a single slot on the policy and there are now two rules that
 * want it — the planif gate and this one. Chained rather than merged because
 * they reason about different things: one about a file's contents, one about
 * its location, and folding them into one function would make each harder to
 * read than both are apart.
 */
export function chainEditRules(
  ...rules: readonly ((edit: ProposedFileEdit) => EditRuling | Promise<EditRuling>)[]
): (edit: ProposedFileEdit) => Promise<EditRuling> {
  return async (edit) => {
    for (const rule of rules) {
      const ruling = await rule(edit)
      if (ruling !== undefined) return ruling
    }
    return undefined
  }
}
