/**
 * Compound sandbox identity. We never key a resumable sandbox on `threadId`
 * alone — that would resume the WRONG environment when the provider,
 * workspace, image, or tenant changes. The key folds all of those in, so any
 * change busts the sandbox and forces a fresh create+bootstrap (safe default).
 */
import type { WorkspaceDefinition } from './workspace'

/** Inputs that, together, identify one resumable sandbox instance. */
export interface SandboxKeyInput {
  threadId: string
  sandboxId: string
  providerName: string
  workspace?: WorkspaceDefinition
  /** Optional tenant scoping pulled from runtimeContext. */
  tenant?: { userId?: string; orgId?: string }
}

/** Deterministic, dependency-free 64-bit FNV-1a hash → hex string. */
function fnv1a(input: string): string {
  // Two 32-bit lanes to approximate 64-bit without BigInt overhead concerns.
  let h1 = 0x811c9dc5
  let h2 = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i)
    h1 ^= c & 0xff
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= (c >> 8) & 0xff
    h2 = Math.imul(h2, 0x01000193)
  }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0')
  return hex(h1) + hex(h2)
}

/** Canonical, key-sorted JSON so logically-equal inputs hash identically. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
    .join(',')}}`
}

/**
 * Hash of the parts of a workspace that change what the agent sees. Secrets are
 * intentionally excluded (rotating a token must not orphan the sandbox).
 */
export function computeWorkspaceHash(workspace: WorkspaceDefinition | undefined): string {
  if (!workspace) return fnv1a('no-workspace')
  const { secrets: _secrets, ...rest } = workspace
  return fnv1a(canonical(rest))
}

/** Compute the compound sandbox instance key. */
export function computeSandboxKey(input: SandboxKeyInput): string {
  const material = canonical({
    threadId: input.threadId,
    sandboxId: input.sandboxId,
    providerName: input.providerName,
    workspaceHash: computeWorkspaceHash(input.workspace),
    tenant: input.tenant ?? null,
  })
  return fnv1a(material)
}
