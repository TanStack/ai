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
 * 64-bit FNV-1a returned as a base36 string.
 *
 * Implementation notes:
 *  - The canonical 64-bit FNV-1a offset basis is `0xcbf29ce484222325`.
 *    JS doesn't have native u64 bitwise math, so we split it into
 *    `hHi = 0xcbf29ce4` and `hLo = 0x84222325` and operate on the
 *    halves with `Math.imul`.
 *  - The canonical 64-bit FNV-1a prime is `0x100000001b3`. The low 32
 *    bits are `0x01000193`; the high 32 bits are exactly `1`. So
 *    multiplying a 64-bit accumulator `(hHi, hLo)` by the prime can be
 *    expressed (mod 2^64) as:
 *
 *        (hHi:hLo) * prime
 *      = (hHi * 0x01000193 + hLo * 0x01000000)  : (hLo * 0x01000193)
 *
 *    with carry from low into high handled below. Concretely:
 *
 *        newLo = hLo * 0x01000193                          (mod 2^32)
 *        newHi = hHi * 0x01000193 + (hLo << 8)             (mod 2^32) + carry
 *
 *    Carry = high 32 bits of (hLo * 0x01000193).
 *  - Per FNV-1a, we XOR each byte into the low half BEFORE the
 *    multiply, not after. The multiply diffuses the byte across both
 *    halves through the carry term, so `hHi` does absorb input — this
 *    is what gives the hash its 64-bit-strength dispersion.
 *
 * Used only for workflow source fingerprinting (equality compare).
 * Crypto-strength is not required.
 */
function fnv1a64(input: string): string {
  const FNV_PRIME_LO = 0x01000193
  let hHi = 0xcbf29ce4
  let hLo = 0x84222325

  // Encode the string as UTF-8 bytes — `charCodeAt` would skip the
  // upper byte of any non-ASCII char, weakening dispersion. Browser /
  // Node both expose TextEncoder.
  const bytes = new TextEncoder().encode(input)
  for (const byte of bytes) {
    hLo ^= byte

    // 64-bit multiply by the FNV prime, low half (modular):
    //   newLo = (hLo * 0x01000193) & 0xffffffff
    const loProduct = hLo * FNV_PRIME_LO
    const newLo = loProduct >>> 0
    // High half = (hHi * 0x01000193 + hLo << 8 + carry-from-low) & 0xffffffff.
    // The carry-from-low is the top 32 bits of loProduct; recover it via
    // floor-division since the product fits in JS's 53-bit safe integer
    // range (hLo < 2^32, FNV_PRIME_LO < 2^25 → product < 2^57; still
    // unsafe at the edge, so we split hLo into its top and bottom 16
    // bits and combine via Math.imul to stay exact).
    const hLoHi16 = (hLo >>> 16) & 0xffff
    const hLoLo16 = hLo & 0xffff
    const carry =
      (Math.imul(hLoHi16, FNV_PRIME_LO) +
        ((Math.imul(hLoLo16, FNV_PRIME_LO) >>> 16) & 0xffff)) >>>
      16
    const newHi =
      (Math.imul(hHi, FNV_PRIME_LO) + ((hLo << 8) >>> 0) + carry) >>> 0
    hLo = newLo
    hHi = newHi
  }
  return hHi.toString(36) + '-' + hLo.toString(36)
}
