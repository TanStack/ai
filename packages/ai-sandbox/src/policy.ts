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

export function commandAliases(
  command: string,
  scripts: Record<string, string> | undefined,
): Array<string> {
  const trimmed = command.trim()
  const aliases = new Set<string>([trimmed])
  if (scripts === undefined) return [...aliases]

  const expanded = scripts[trimmed]
  if (expanded !== undefined) aliases.add(expanded)

  const scriptEntries = Object.entries(scripts)
  for (const [name, value] of scriptEntries) {
    if (value === trimmed) aliases.add(name)
  }
  return [...aliases]
}

function patternMatchesCommand(
  pattern: string,
  command: string,
  scripts: Record<string, string> | undefined,
): boolean {
  const commandForms = commandAliases(command, scripts)
  const patternForms = commandAliases(pattern, scripts)
  for (const patternForm of patternForms) {
    const re = patternToRegExp(patternForm)
    if (commandForms.some((form) => re.test(form))) return true
  }
  return false
}

export function evaluateCommand(
  command: string,
  policy: SandboxPolicy | undefined,
  scripts?: Record<string, string>,
): PolicyDecision {
  const fallback = policy?.default ?? 'ask'
  const rules = policy?.commands
  if (!rules) return fallback

  const matches = (patterns: Array<string> | undefined): boolean =>
    (patterns ?? []).some((pattern) =>
      patternMatchesCommand(pattern, command, scripts),
    )

  if (matches(rules.deny)) return 'deny'
  if (matches(rules.ask)) return 'ask'
  if (matches(rules.allow)) return 'allow'
  return fallback
}
