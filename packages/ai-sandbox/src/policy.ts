/**
 * Sandbox policy — a portable, harness-agnostic description of what the agent
 * may do. Each harness adapter MAPS this onto its native permission system
 * (Claude Code → canUseTool + allowedTools/disallowedTools/permissionMode).
 *
 * Command rules are matched as glob/prefix patterns against the command line.
 * Precedence is deny > ask > allow; unmatched commands fall to `default`.
 * `'ask'` surfaces the existing resume-based `approval-requested` flow.
 */

export type PolicyDecision = 'allow' | 'ask' | 'deny'

export interface CommandRules {
  /** Glob/prefix patterns to allow outright (e.g. 'pnpm *', 'git diff'). */
  allow?: Array<string>
  /** Patterns that require approval before running. */
  ask?: Array<string>
  /** Patterns to refuse (e.g. 'sudo *', 'rm -rf *'). */
  deny?: Array<string>
}

/** Coarse, non-command capability gates for tools like Write/Edit and network. */
export interface CapabilityRules {
  /** File-modifying tools (Write/Edit). Defaults to the policy `default`. */
  fileWrite?: PolicyDecision
  /** Outbound network access. Defaults to the policy `default`. */
  network?: PolicyDecision
}

export interface SandboxPolicy {
  commands?: CommandRules
  capabilities?: CapabilityRules
  /** Decision for anything not matched by a rule. Defaults to `'ask'`. */
  default?: PolicyDecision
}

export function defineSandboxPolicy(policy: SandboxPolicy): SandboxPolicy {
  return policy
}

/** Convert a glob/prefix pattern to a RegExp anchored to the full command. */
function patternToRegExp(pattern: string): RegExp {
  // Escape regex metacharacters except '*', then turn '*' into '.*'.
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/**
 * Resolve a command line against the policy. Precedence: deny > ask > allow,
 * then `default` (defaults to `'ask'`). Exported for adapter permission
 * mappers and unit tests.
 */
export function evaluateCommand(
  command: string,
  policy: SandboxPolicy | undefined,
): PolicyDecision {
  const fallback = policy?.default ?? 'ask'
  const rules = policy?.commands
  if (!rules) return fallback

  const matches = (patterns: Array<string> | undefined): boolean =>
    (patterns ?? []).some((p) => patternToRegExp(p).test(command.trim()))

  if (matches(rules.deny)) return 'deny'
  if (matches(rules.ask)) return 'ask'
  if (matches(rules.allow)) return 'allow'
  return fallback
}
