import type { PolicyDecision, SandboxPolicy } from '@tanstack/ai-sandbox'
import type { ClaudeCodePermissionMode } from './text'

export interface ClaudePolicyFlags {
  permissionMode?: ClaudeCodePermissionMode
  allowedTools: Array<string>
  disallowedTools: Array<string>
}

const WRITE_TOOLS = ['Write', 'Edit', 'MultiEdit']
const NETWORK_TOOLS = ['WebFetch', 'WebSearch']
const BUILTIN_TOOL_NAMES = new Set([
  'Bash',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'Task',
])

function modeFor(decision: PolicyDecision): ClaudeCodePermissionMode {
  switch (decision) {
    case 'allow':
      return 'bypassPermissions'
    case 'ask':
      return 'acceptEdits'
    case 'deny':
      return 'default'
  }
}

export function mapPolicyToClaudeFlags(
  policy: SandboxPolicy | undefined,
): ClaudePolicyFlags {
  const allowedTools: Array<string> = []
  const disallowedTools: Array<string> = []
  if (!policy) return { allowedTools, disallowedTools }

  if (policy.capabilities?.fileWrite === 'deny')
    disallowedTools.push(...WRITE_TOOLS)
  if (policy.capabilities?.network === 'deny')
    disallowedTools.push(...NETWORK_TOOLS)

  // Tool-name-level command rules map directly; everything else is left to the
  // permission-prompt tool.
  for (const pattern of policy.commands?.deny ?? []) {
    if (BUILTIN_TOOL_NAMES.has(pattern)) disallowedTools.push(pattern)
  }
  for (const pattern of policy.commands?.allow ?? []) {
    if (BUILTIN_TOOL_NAMES.has(pattern)) allowedTools.push(pattern)
  }

  const result: ClaudePolicyFlags = {
    allowedTools: [...new Set(allowedTools)],
    disallowedTools: [...new Set(disallowedTools)],
  }
  if (policy.default !== undefined)
    result.permissionMode = modeFor(policy.default)
  return result
}
