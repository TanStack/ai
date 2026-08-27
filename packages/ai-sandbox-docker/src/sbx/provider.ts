import { access, writeFile } from 'node:fs/promises'
import { parseJsonAfterBanner, parseSbxLs, runSbx, sbxExecArgs } from './cli'
import type { SbxSpawn } from './cli'
import {
  isAlreadyGone,
  isNameAlreadyExists,
  SbxHandle,
  SBX_CAPS,
} from './handle'
import {
  ownedCloneMarkerPath,
  removeOwnedClone,
  resolveHostRepo,
  sandboxNameFromId,
} from './materialize'
import { planSbxPolicy, policyArgs } from './policy'
import type { SbxPolicyPlan } from './policy'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface SbxSandboxConfig {
  workspaceDir?: string
  allowNetwork?: Array<string>
  denyNetwork?: Array<string>
  sbxBinary?: string
  publishPorts?: Array<number>
  cpus?: number
  memory?: string
  logger?: { warn: (message: string, meta?: Record<string, unknown>) => void }
  /** Test seam. Production leaves this unset. */
  spawn?: SbxSpawn
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasPolicyRows(stdout: string): boolean {
  const text = stdout.trim()
  if (text === '') return false
  const parsed: unknown = parseJsonAfterBanner(text)
  if (Array.isArray(parsed)) return parsed.length > 0
  if (isRecord(parsed)) {
    for (const key of ['policies', 'items', 'rules']) {
      const val = parsed[key]
      if (Array.isArray(val)) return val.length > 0
    }
  }
  throw new Error(
    `sbx policy ls --json returned no policy list: ${text.slice(0, 200)}`,
  )
}

function isOpenHost(value: string): boolean {
  const host = value.trim()
  return host === '**' || host.startsWith('**:')
}

function isOpenPresetName(value: string): boolean {
  const name = value.trim().toLowerCase()
  return name === 'open' || name === 'allow-all' || name === 'allowall'
}

function resourceTypeOf(rule: Record<string, unknown>): string | undefined {
  const raw = rule.resource_type ?? rule.resourceType ?? rule.type
  return typeof raw === 'string' ? raw.toLowerCase() : undefined
}

function isNetworkResourceType(resourceType: string | undefined): boolean {
  return resourceType !== undefined && resourceType.includes('network')
}

function ruleIsOpenNetwork(rule: Record<string, unknown>): boolean {
  const resourceType = resourceTypeOf(rule)
  const isNonNetworkRule =
    resourceType !== undefined && !isNetworkResourceType(resourceType)
  if (isNonNetworkRule) {
    return false
  }

  const name = rule.name ?? rule.preset ?? rule.id
  const isOpenPreset = typeof name === 'string' && isOpenPresetName(name)
  if (isOpenPreset) return true

  const decision = String(rule.decision ?? rule.action ?? 'allow').toLowerCase()
  const isRestrictiveRule =
    decision === 'deny' || decision === 'ask' || decision === 'prompt'
  if (isRestrictiveRule) {
    return false
  }

  const resources = rule.resources ?? rule.hosts ?? rule.allow
  if (Array.isArray(resources)) {
    return resources.some(
      (entry) => typeof entry === 'string' && isOpenHost(entry),
    )
  }
  if (typeof resources === 'string') return isOpenHost(resources)
  return false
}

function collectPolicyRules(parsed: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord)
  }
  if (!isRecord(parsed)) return []
  for (const key of ['rules', 'policies', 'items']) {
    const val = parsed[key]
    if (Array.isArray(val)) return val.filter(isRecord)
  }
  return [parsed]
}

function isOpenMachinePreset(stdout: string): boolean {
  const text = stdout.trim()
  if (text === '') return false
  try {
    const rules = collectPolicyRules(parseJsonAfterBanner(text))
    if (rules.length === 0) return false
    return rules.some(ruleIsOpenNetwork)
  } catch {
    const lower = text.toLowerCase()
    const isAllowAllText =
      lower.includes('allow-all') || lower.includes('allowall')
    if (isAllowAllText) return true
    const isOpenNetworkStar =
      /network[^\\n]{0,80}\*\*/i.test(text) &&
      !/network[^\\n]{0,80}("decision"\s*:\s*"deny"|decision\s*[:=]\s*deny)/i.test(
        text,
      )
    if (isOpenNetworkStar) {
      return true
    }
    return /(^|[\s:"'{,])open($|[\s,"'}])/i.test(text)
  }
}

function isDenyAskAllowlist(plan: SbxPolicyPlan): boolean {
  return (
    plan.kind === 'per-sandbox' &&
    plan.allow.length > 0 &&
    !plan.allow.includes('**')
  )
}

async function ownedCloneMarkerExists(id: string): Promise<boolean> {
  try {
    await access(ownedCloneMarkerPath(id))
    return true
  } catch {
    return false
  }
}

function isAlreadyInitialized(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase()
  return (
    message.includes('already initialized') || message.includes('already set')
  )
}

async function listEntries(
  binary: string,
  spawn: SbxSpawn | undefined,
  signal?: AbortSignal,
): Promise<ReturnType<typeof parseSbxLs>> {
  const result = await runSbx(['ls', '--json'], {
    binary,
    ...(spawn ? { spawn } : {}),
    ...(signal ? { signal } : {}),
  })
  return parseSbxLs(result.stdout)
}

class SbxProvider implements SandboxProvider {
  readonly name = 'sbx'

  constructor(private readonly config: SbxSandboxConfig) {}

  capabilities(): SandboxCapabilities {
    return SBX_CAPS
  }

  private get binary(): string {
    return this.config.sbxBinary ?? 'sbx'
  }

  private run(
    args: Array<string>,
    signal?: AbortSignal,
  ): ReturnType<typeof runSbx> {
    return runSbx(args, {
      binary: this.binary,
      ...(this.config.spawn ? { spawn: this.config.spawn } : {}),
      ...(signal ? { signal } : {}),
    })
  }

  private async ensureGlobalPreset(plan: SbxPolicyPlan): Promise<void> {
    const listed = await this.run(['policy', 'ls', '--json'])
    const isOpenPresetBlockingAllowlist =
      isOpenMachinePreset(listed.stdout) && isDenyAskAllowlist(plan)
    if (isOpenPresetBlockingAllowlist) {
      throw new Error(
        'sbxSandbox: the machine policy is Open (allow-all / **). A deny/ask allowlist cannot be enforced on that preset. Run `sbx policy reset` then `sbx policy init deny-all`, or drop the allowlist.',
      )
    }
    if (hasPolicyRows(listed.stdout)) return
    try {
      await this.run(['policy', 'init', 'deny-all'])
    } catch (error) {
      if (isAlreadyInitialized(error)) return
      throw error
    }
  }

  private async resolveWorkspaceRoot(
    name: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const pwd = await this.run(sbxExecArgs(name, 'pwd'), signal)
    const root = pwd.stdout.trim()
    if (!root) throw new Error(`sbx exec pwd returned empty stdout for ${name}`)
    return root
  }

  private makeHandle(
    name: string,
    workspaceRoot: string,
    owned: boolean,
  ): SandboxHandle {
    return new SbxHandle({
      name,
      workspaceRoot,
      binary: this.binary,
      logger: this.config.logger,
      owned,
      ...(this.config.spawn ? { spawn: this.config.spawn } : {}),
    })
  }

  async create(input: SandboxCreateInput): Promise<SandboxHandle> {
    const id = sandboxNameFromId(input.id ?? crypto.randomUUID())
    const plan = planSbxPolicy({
      policy: input.policy,
      adapterName: input.adapterName,
      allowNetwork: this.config.allowNetwork,
      denyNetwork: this.config.denyNetwork,
    })
    const host = await resolveHostRepo({
      id,
      workspaceDir: this.config.workspaceDir,
      workspace: input.workspace,
    })

    await this.ensureGlobalPreset(plan)

    const createArgs = [
      'create',
      '--name',
      id,
      '--clone',
      '--quiet',
      ...(this.config.cpus !== undefined
        ? (['--cpus', String(this.config.cpus)] as const)
        : []),
      ...(this.config.memory !== undefined
        ? (['--memory', this.config.memory] as const)
        : []),
      ...(this.config.publishPorts ?? []).flatMap((port) => [
        '--publish',
        String(port),
      ]),
      'shell',
      host.hostDir,
    ]

    try {
      if (host.owned) {
        await writeFile(ownedCloneMarkerPath(id), '')
      }
      await this.run(createArgs, input.signal)
      if (plan.kind === 'per-sandbox') {
        const commands = policyArgs(plan, id)
        for (const args of commands) {
          await this.run(args, input.signal)
        }
      }

      const workspaceRoot = await this.resolveWorkspaceRoot(id, input.signal)
      const handle = this.makeHandle(id, workspaceRoot, host.owned)
      if (input.env) await handle.env.set(input.env)
      return handle
    } catch (error) {
      if (host.owned) {
        await removeOwnedClone(id)
      }
      if (isNameAlreadyExists(error)) throw error
      let rmError: unknown
      try {
        await this.run(['rm', '--force', id])
      } catch (caught) {
        rmError = caught
      }
      if (rmError && !isAlreadyGone(rmError)) throw rmError
      throw error
    }
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    const id = sandboxNameFromId(input.id)
    const entries = await listEntries(
      this.binary,
      this.config.spawn,
      input.signal,
    )
    const hit = entries.find((entry) => entry.name === id)
    if (!hit) return null
    const workspaceRoot = await this.resolveWorkspaceRoot(id, input.signal)
    const owned = this.config.workspaceDir
      ? false
      : await ownedCloneMarkerExists(id)
    return this.makeHandle(id, workspaceRoot, owned)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    const id = sandboxNameFromId(input.id)
    const owned = this.config.workspaceDir
      ? false
      : await ownedCloneMarkerExists(id)
    let rmError: unknown
    try {
      await this.run(['rm', '--force', id])
    } catch (error) {
      rmError = error
    }
    if (owned) {
      await removeOwnedClone(id)
    }
    if (rmError && !isAlreadyGone(rmError)) {
      this.config.logger?.warn('sbx rm failed', {
        id,
        error: rmError instanceof Error ? rmError.message : String(rmError),
      })
      throw rmError
    }
  }
}

export function sbxSandbox(config: SbxSandboxConfig = {}): SandboxProvider {
  return new SbxProvider(config)
}
