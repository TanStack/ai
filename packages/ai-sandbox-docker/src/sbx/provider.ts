import { rm } from 'node:fs/promises'
import { parseSbxLs, runSbx, sbxExecArgs } from './cli'
import type { SbxSpawn } from './cli'
import { SbxHandle, SBX_CAPS } from './handle'
import {
  ownedHostRepoDir,
  resolveHostRepo,
  sandboxNameFromId,
} from './materialize'
import { planSbxPolicy, policyArgs } from './policy'
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
  try {
    const parsed: unknown = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.length > 0
    if (isRecord(parsed)) {
      for (const key of ['policies', 'items', 'rules']) {
        const val = parsed[key]
        if (Array.isArray(val)) return val.length > 0
      }
      return Object.keys(parsed).length > 0
    }
  } catch {
    return true
  }
  return false
}

async function listEntries(
  binary: string,
  spawn: SbxSpawn | undefined,
): Promise<ReturnType<typeof parseSbxLs>> {
  const result = await runSbx(['ls', '--json'], {
    binary,
    ...(spawn ? { spawn } : {}),
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

  private async ensureGlobalPreset(): Promise<void> {
    try {
      const listed = await this.run(['policy', 'ls', '--json'])
      if (hasPolicyRows(listed.stdout)) return
    } catch {
      // Probe failed or returned nothing usable. Init once; a real login
      // error will fail again on init and stay loud.
    }
    await this.run(['policy', 'init', 'deny-all'])
  }

  private async resolveWorkspaceRoot(name: string): Promise<string> {
    const entries = await listEntries(this.binary, this.config.spawn)
    const hit = entries.find((entry) => entry.name === name)
    if (hit?.workspace) return hit.workspace
    const pwd = await this.run(sbxExecArgs(name, 'pwd'))
    return pwd.stdout.trim()
  }

  private makeHandle(name: string, workspaceRoot: string): SandboxHandle {
    return new SbxHandle({
      name,
      workspaceRoot,
      binary: this.binary,
      logger: this.config.logger,
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

    await this.ensureGlobalPreset()

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
    await this.run(createArgs, input.signal)

    if (plan.kind === 'per-sandbox') {
      for (const args of policyArgs(plan, id)) {
        await this.run(args, input.signal)
      }
    }

    const workspaceRoot = await this.resolveWorkspaceRoot(id)
    const handle = this.makeHandle(id, workspaceRoot)
    if (input.env) await handle.env.set(input.env)
    return handle
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    const id = sandboxNameFromId(input.id)
    const entries = await listEntries(this.binary, this.config.spawn)
    const hit = entries.find((entry) => entry.name === id)
    if (!hit) return null
    const workspaceRoot =
      hit.workspace ?? (await this.resolveWorkspaceRoot(id))
    return this.makeHandle(id, workspaceRoot)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    const id = sandboxNameFromId(input.id)
    try {
      await this.run(['rm', '--force', id])
    } catch (error) {
      this.config.logger?.warn('sbx rm failed', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    if (!this.config.workspaceDir) {
      await rm(ownedHostRepoDir(id), {
        recursive: true,
        force: true,
      })
    }
  }
}

export function sbxSandbox(config: SbxSandboxConfig = {}): SandboxProvider {
  return new SbxProvider(config)
}
