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
  const needsConservative =
    hasAsk || policy.default === 'deny' || policy.default === 'ask'
  if (needsConservative) {
    flags.conservative = true
  }

  return flags
}
