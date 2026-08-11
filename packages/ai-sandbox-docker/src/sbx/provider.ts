import { rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { parseSbxLs, runSbx } from './cli'
import type { SbxSpawn } from './cli'
import { SbxHandle, SBX_CAPS } from './handle'
import { resolveHostRepo } from './materialize'
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
      await this.run(['policy', '--json'])
    } catch {
      await this.run(['policy', 'init', 'deny-all'])
    }
  }

  private async resolveWorkspaceRoot(name: string): Promise<string> {
    const entries = await listEntries(this.binary, this.config.spawn)
    const hit = entries.find((entry) => entry.name === name)
    if (hit?.workspace) return hit.workspace
    const pwd = await this.run(['exec', name, '--', 'pwd'])
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
    const id = input.id
    if (!id) {
      throw new Error('sbxSandbox.create requires input.id')
    }
    const host = await resolveHostRepo({
      id,
      workspaceDir: this.config.workspaceDir,
      workspace: input.workspace,
    })
    const plan = planSbxPolicy({
      policy: input.policy,
      adapterName: input.adapterName,
      allowNetwork: this.config.allowNetwork,
      denyNetwork: this.config.denyNetwork,
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
    const entries = await listEntries(this.binary, this.config.spawn)
    const hit = entries.find((entry) => entry.name === input.id)
    if (!hit) return null
    const workspaceRoot =
      hit.workspace ?? (await this.resolveWorkspaceRoot(input.id))
    return this.makeHandle(input.id, workspaceRoot)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    try {
      await this.run(['rm', '--force', input.id])
    } catch (error) {
      this.config.logger?.warn('sbx rm failed', {
        id: input.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    if (!this.config.workspaceDir) {
      await rm(path.join(tmpdir(), 'tanstack-sbx', input.id), {
        recursive: true,
        force: true,
      })
    }
  }
}

export function sbxSandbox(config: SbxSandboxConfig = {}): SandboxProvider {
  return new SbxProvider(config)
}
