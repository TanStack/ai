import type { PolicyDecision, SandboxPolicy } from '@tanstack/ai-sandbox'

export type SbxPolicyPlan =
  | { kind: 'machine-preset' }
  | { kind: 'per-sandbox'; allow: Array<string>; deny: Array<string> }

const AUTO_HOSTS: Record<string, Array<string>> = {
  'grok-build': ['api.x.ai'],
  'claude-code': ['api.anthropic.com'],
  codex: ['api.openai.com'],
}

const EMPTY_ALLOWLIST =
  'sbxSandbox: network deny/ask has an empty allowlist. Pass allowNetwork, or use grokBuildText / claudeCodeText / codexText so the model API host is added.'

export function autoApiHosts(adapterName: string | undefined): Array<string> {
  if (!adapterName) return []
  return AUTO_HOSTS[adapterName] ?? []
}

function networkDecision(
  policy: SandboxPolicy | undefined,
): PolicyDecision | undefined {
  if (!policy) return undefined
  return policy.capabilities?.network ?? policy.default ?? 'ask'
}

export function planSbxPolicy(input: {
  policy?: SandboxPolicy
  adapterName?: string
  allowNetwork?: Array<string>
  denyNetwork?: Array<string>
}): SbxPolicyPlan {
  const hasHostLists =
    (input.allowNetwork?.length ?? 0) > 0 ||
    (input.denyNetwork?.length ?? 0) > 0
  if (!input.policy && !hasHostLists) {
    return { kind: 'machine-preset' }
  }

  const decision = networkDecision(input.policy)
  const deny = [...(input.denyNetwork ?? [])]

  if (decision === 'allow') {
    return { kind: 'per-sandbox', allow: ['**'], deny }
  }

  // deny, ask, or host lists with no policy: allowlist
  const allow = [
    ...autoApiHosts(input.adapterName),
    ...(input.allowNetwork ?? []),
  ]
  if (allow.length === 0 && decision !== 'allow') {
    throw new Error(EMPTY_ALLOWLIST)
  }
  return { kind: 'per-sandbox', allow, deny }
}

export function policyArgs(
  plan: Extract<SbxPolicyPlan, { kind: 'per-sandbox' }>,
  sandboxName: string,
): Array<Array<string>> {
  const commands: Array<Array<string>> = []
  for (const host of plan.allow) {
    commands.push([
      'policy',
      'allow',
      'network',
      '--sandbox',
      sandboxName,
      host,
    ])
  }
  for (const host of plan.deny) {
    commands.push([
      'policy',
      'deny',
      'network',
      '--sandbox',
      sandboxName,
      host,
    ])
  }
  return commands
}
