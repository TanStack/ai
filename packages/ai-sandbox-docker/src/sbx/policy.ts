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

/** Guest URLs use host.docker.internal; the sbx proxy rewrites that to localhost. */
const BRIDGE_HOST = 'localhost'

export function autoApiHosts(adapterName: string | undefined): Array<string> {
  if (!adapterName) return []
  if (!Object.hasOwn(AUTO_HOSTS, adapterName)) return []
  return AUTO_HOSTS[adapterName] ?? []
}

function withBridgeHost(hosts: Array<string>): Array<string> {
  const hasBridgeOrWildcard =
    hosts.includes(BRIDGE_HOST) || hosts.includes('**')
  if (hasBridgeOrWildcard) return hosts
  return [...hosts, BRIDGE_HOST]
}

function networkDecision(
  policy: SandboxPolicy | undefined,
): PolicyDecision | undefined {
  if (!policy) return undefined
  return policy.capabilities?.network ?? policy.default ?? 'ask'
}

function planRestrictedNetwork(input: {
  policy?: SandboxPolicy
  allowNetwork?: Array<string>
  denyNetwork?: Array<string>
  auto: Array<string>
}): SbxPolicyPlan {
  const decision = networkDecision(input.policy)
  const deny = [...(input.denyNetwork ?? [])]
  if (decision === 'allow') {
    return { kind: 'per-sandbox', allow: ['**'], deny }
  }

  const mergeAuto =
    Boolean(input.policy) || (input.allowNetwork?.length ?? 0) > 0
  const allow = [
    ...(mergeAuto ? input.auto : []),
    ...(input.allowNetwork ?? []),
  ]
  const isEmptyDenyAskAllowlist =
    allow.length === 0 && (decision === 'deny' || decision === 'ask')
  if (isEmptyDenyAskAllowlist) {
    throw new Error(EMPTY_ALLOWLIST)
  }
  return {
    kind: 'per-sandbox',
    allow: mergeAuto && allow.length > 0 ? withBridgeHost(allow) : allow,
    deny,
  }
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
  const auto = autoApiHosts(input.adapterName)
  const usesMachinePreset = !input.policy && !hasHostLists
  if (usesMachinePreset) {
    if (auto.length > 0) {
      return { kind: 'per-sandbox', allow: withBridgeHost(auto), deny: [] }
    }
    return { kind: 'machine-preset' }
  }

  return planRestrictedNetwork({ ...input, auto })
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
    commands.push(['policy', 'deny', 'network', '--sandbox', sandboxName, host])
  }
  return commands
}
