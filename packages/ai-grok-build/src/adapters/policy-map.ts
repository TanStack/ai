/**
 * Map a portable {@link SandboxPolicy} onto Grok Build harness flags.
 *
 * Coarse mapping for the headless NDJSON harness (`grok -p`):
 * - `capabilities.fileWrite === 'deny'` → `--sandbox read-only`
 * - `capabilities.network === 'deny'` → `--disable-web-search`
 * - `default: 'deny'`, `default: 'ask'`, or `commands.ask` → conservative
 *   (omit `--always-approve`, use `--permission-mode default`).
 *   A deny list alone is a hard block, not a human prompt, so it does
 *   not flip the approval flag. Headless `grok -p` auto-cancels tools
 *   when conservative is true.
 */
import type { SandboxPolicy } from '@tanstack/ai-sandbox'

export interface GrokBuildPolicyFlags {
  readOnly?: boolean
  networkDisabled?: boolean
  /** When true, omit `--always-approve` and use a restrictive permission mode. */
  conservative?: boolean
}

export function mapPolicyToGrokBuildFlags(
  policy: SandboxPolicy | undefined,
): GrokBuildPolicyFlags {
  if (!policy) return {}
  const flags: GrokBuildPolicyFlags = {}
  if (policy.capabilities?.fileWrite === 'deny') flags.readOnly = true
  if (policy.capabilities?.network === 'deny') flags.networkDisabled = true

  const hasAsk = (policy.commands?.ask?.length ?? 0) > 0
  if (hasAsk || policy.default === 'deny' || policy.default === 'ask') {
    flags.conservative = true
  }

  return flags
}
