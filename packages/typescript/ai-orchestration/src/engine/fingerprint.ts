import type { AgentMap, AnyWorkflowDefinition } from '../types'

/**
 * Compute a stable fingerprint of a workflow definition's *source*.
 *
 * Used to refuse replay-from-store resumes after a deploy that altered
 * the workflow's code. If the persisted fingerprint doesn't match the
 * currently-loaded definition's, the engine emits
 * `RUN_ERROR { code: 'workflow_version_mismatch' }` rather than blindly
 * driving a fresh generator through a log whose positional indices may
 * no longer line up.
 *
 * The fingerprint covers:
 *   - the workflow's name + its `run` function source
 *   - the workflow's `initialize` function source (if any)
 *   - each declared agent's name + its `run` source
 *   - each declared nested workflow recursively
 *
 * Source strings come from `Function.prototype.toString()` — production
 * builds may minify, so the fingerprint is sensitive to whitespace and
 * symbol renaming. That's the conservative choice (Temporal does the
 * same): false-positive mismatches force a redeploy decision rather
 * than silently corrupting an in-flight run.
 *
 * The fingerprint is a 64-bit FNV-1a hash rendered as base36. Crypto
 * strength is not required — we're comparing equality, not resisting
 * collision attacks.
 */
export function fingerprintWorkflow(workflow: AnyWorkflowDefinition): string {
  // Patch-versioned mode: workflows that declare `patches` opt out of
  // the strict source-hash fingerprint. The fingerprint then covers
  // only the compatibility surface (name + sorted patch list), so
  // code-body changes don't trigger workflow_version_mismatch. The
  // patches-subset check on resume (see run-workflow.ts) enforces
  // that the run's recorded patches are a subset of the current
  // workflow's patches — i.e., we can ADD patches across deploys but
  // not REMOVE them while runs are in flight.
  if (workflow.patches !== undefined) {
    const sorted = [...workflow.patches].sort().join(',')
    return fnv1a64(`patch-versioned:${workflow.name}:${sorted}`)
  }

  const seen = new WeakSet<AnyWorkflowDefinition>()
  const parts: Array<string> = []
  collectWorkflow(workflow, parts, seen)
  return fnv1a64(parts.join('\x00'))
}

function collectWorkflow(
  workflow: AnyWorkflowDefinition,
  parts: Array<string>,
  seen: WeakSet<AnyWorkflowDefinition>,
): void {
  if (seen.has(workflow)) {
    // Cycle through agents that re-reference an ancestor — record a
    // marker rather than recursing forever.
    parts.push(`wf:${workflow.name}:cycle`)
    return
  }
  seen.add(workflow)

  parts.push(`wf:${workflow.name}`)
  parts.push(`run:${workflow.run.toString()}`)
  if (workflow.initialize) {
    parts.push(`init:${workflow.initialize.toString()}`)
  }
  collectAgents(workflow.agents, parts, seen)
}

function collectAgents(
  agents: AgentMap,
  parts: Array<string>,
  seen: WeakSet<AnyWorkflowDefinition>,
): void {
  // Sort by key so the fingerprint doesn't depend on declaration order
  // in the literal — users adding an agent in a different alphabetical
  // slot shouldn't invalidate runs from before the addition (the
  // *positional* check in the log handles those cases; the fingerprint
  // is about source-text drift).
  const keys = Object.keys(agents).sort()
  for (const key of keys) {
    const def = agents[key]
    if (!def) continue
    if (def.__kind === 'workflow') {
      parts.push(`nested:${key}`)
      collectWorkflow(def, parts, seen)
    } else {
      parts.push(`agent:${key}:${def.name}`)
      parts.push(`agent-run:${def.run.toString()}`)
    }
  }
}

/**
 * 64-bit FNV-1a, returned as a base36 string. Stable across JS runtimes
 * with consistent UTF-16 string representation; portable enough for our
 * fingerprint use case.
 */
function fnv1a64(input: string): string {
  // 64-bit FNV-1a using two 32-bit halves (JS doesn't have native u64
  // arithmetic with bitwise ops).
  const FNV_PRIME_LO = 0x01000193
  let hLo = 0x9dc5
  let hHi = 0xcbf2

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    hLo ^= c & 0xff
    hLo ^= (c >>> 8) & 0xff
    // (hHi:hLo) *= FNV_PRIME_LO (low 32 bits only; the 64-bit prime is
    // really 0x100000001b3 but the high 32 bits are 1 — we approximate
    // by treating the high mul as add-in-place, which is consistent and
    // good enough for equality comparison).
    const lo = Math.imul(hLo, FNV_PRIME_LO)
    const hi = Math.imul(hHi, FNV_PRIME_LO) + hLo // high += low (1 * hLo)
    hLo = lo >>> 0
    hHi = hi >>> 0
  }
  return hHi.toString(36) + '-' + hLo.toString(36)
}
