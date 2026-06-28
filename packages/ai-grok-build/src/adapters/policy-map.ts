/**
 * Map a portable {@link SandboxPolicy} onto Grok Build harness flags.
 *
 * Coarse mapping for a headless harness:
 * - `capabilities.fileWrite === 'deny'` → read-only behavior (adapter-level)
 * - `capabilities.network === 'deny'` → network disabled hint
 * - `default: 'deny'` or rules → conservative policy
 */
import type { SandboxPolicy } from '@tanstack/ai-sandbox'

export interface GrokBuildPolicyFlags {
  readOnly?: boolean
  networkDisabled?: boolean
}

export function mapPolicyToGrokBuildFlags(
  policy: SandboxPolicy | undefined,
): GrokBuildPolicyFlags {
  if (!policy) return {}
  const flags: GrokBuildPolicyFlags = {}
  if (policy.capabilities?.fileWrite === 'deny') flags.readOnly = true
  if (policy.capabilities?.network === 'deny') flags.networkDisabled = true
  return flags
}
