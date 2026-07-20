/**
 * Map a portable {@link SandboxPolicy} onto Codex CLI settings.
 *
 * **Best-effort, coarse mapping.** `codex exec --experimental-json` runs
 * non-interactively: there is no per-action host callback (unlike Claude Code's
 * `--permission-prompt-tool`), so the fine-grained, resume-based interactive
 * approval flow (`deny` + `approval-requested` + re-run) is NOT available for
 * Codex. Instead the policy collapses onto Codex's coarse knobs:
 *
 * - `capabilities.fileWrite === 'deny'` → `--sandbox read-only`
 *   (otherwise `workspace-write`).
 * - `capabilities.network` → `sandbox_workspace_write.network_access`
 *   (`'allow'` → true, `'deny'` → false; unset leaves Codex's default).
 * - `approval_policy`: a fully-permissive policy (`default: 'allow'` with no
 *   `ask`/`deny` rules) → `never`; a `default: 'deny'` policy → `untrusted`;
 *   anything with `ask`/`deny` rules → `on-request`. In `exec` mode Codex will
 *   refuse (rather than prompt for) actions that need approval.
 *
 * Returns only the knobs the policy actually constrains; the adapter merges
 * these with its own config (config/modelOptions still take precedence).
 */
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

  const hasAskOrDeny =
    (policy.commands?.ask?.length ?? 0) > 0 ||
    (policy.commands?.deny?.length ?? 0) > 0
  if (hasAskOrDeny) {
    flags.approvalPolicy = 'on-request'
  } else if (policy.default === 'deny') {
    flags.approvalPolicy = 'untrusted'
  } else if (policy.default === 'allow') {
    flags.approvalPolicy = 'never'
  }

  return flags
}
