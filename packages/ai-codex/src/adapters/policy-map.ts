import type { SandboxPolicy } from '@tanstack/ai-sandbox'
import type { CodexApprovalMode, CodexSandboxMode } from './text'

export interface CodexPolicyFlags {
  sandboxMode?: CodexSandboxMode
  approvalPolicy?: CodexApprovalMode
  networkAccessEnabled?: boolean
}

export function mapPolicyToCodexFlags(
  policy: SandboxPolicy | undefined,
): CodexPolicyFlags {
  if (!policy) return {}
  const flags: CodexPolicyFlags = {}

  if (policy.capabilities?.fileWrite === 'deny') {
    flags.sandboxMode = 'read-only'
  }
  if (policy.capabilities?.network === 'allow') {
    flags.networkAccessEnabled = true
  } else if (policy.capabilities?.network === 'deny') {
    flags.networkAccessEnabled = false
  }

  const hasAsk = (policy.commands?.ask?.length ?? 0) > 0
  const needsOnRequest = hasAsk || policy.default === 'ask'
  if (needsOnRequest) {
    flags.approvalPolicy = 'on-request'
  } else if (policy.default === 'deny') {
    flags.approvalPolicy = 'untrusted'
  } else if (policy.default === 'allow') {
    flags.approvalPolicy = 'never'
  }

  return flags
}
