import { randomUUID } from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  LOCAL_PROCESS_CAPS,
  LocalProcessHandle,
  removeDirWithRetry,
} from './handle'
import type { LocalProcessLogger } from './handle'
import type {
  SandboxCapabilities,
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

export interface LocalProcessSandboxConfig {
  dir?: string
  /** Override the default temp base dir for generated sandboxes. */
  baseDir?: string
  /** Remove the backing dir on destroy. Defaults: true (generated), false (fixed `dir`). */
  removeOnDestroy?: boolean
  scrubEnv?: Array<string>
  logger?: LocalProcessLogger
}

class LocalProcessProvider implements SandboxProvider {
  readonly name = 'local-process'

  constructor(private readonly config: LocalProcessSandboxConfig) {}

  capabilities(): SandboxCapabilities {
    return LOCAL_PROCESS_CAPS
  }

  private removeDefault(): boolean {
    return this.config.removeOnDestroy ?? this.config.dir === undefined
  }

  private makeHandle(root: string): SandboxHandle {
    return new LocalProcessHandle({
      root,
      removeOnDestroy: this.removeDefault(),
      scrubEnv: this.config.scrubEnv,
      logger: this.config.logger,
      forkFactory: async (sourceRoot) => {
        const dest = path.join(this.baseDir(), `fork-${randomUUID()}`)
        await fsp.mkdir(dest, { recursive: true })
        await fsp.cp(sourceRoot, dest, { recursive: true })
        return new LocalProcessHandle({
          root: dest,
          removeOnDestroy: true,
          logger: this.config.logger,
          forkFactory: () =>
            Promise.reject(new Error('nested fork unsupported')),
        })
      },
    })
  }

  private baseDir(): string {
    return (
      this.config.baseDir ?? path.join(os.tmpdir(), 'tanstack-ai-sandboxes')
    )
  }

  async create(_input: SandboxCreateInput): Promise<SandboxHandle> {
    const root =
      this.config.dir !== undefined
        ? path.resolve(this.config.dir)
        : path.join(this.baseDir(), randomUUID())
    await fsp.mkdir(root, { recursive: true })
    return this.makeHandle(root)
  }

  async resume(input: SandboxResumeInput): Promise<SandboxHandle | null> {
    // The id is the backing dir path; resume only if it still exists.
    try {
      const stat = await fsp.stat(input.id)
      if (!stat.isDirectory()) return null
    } catch {
      return null
    }
    return this.makeHandle(input.id)
  }

  async destroy(input: SandboxDestroyInput): Promise<void> {
    if (this.removeDefault()) {
      await removeDirWithRetry(input.id, this.config.logger)
    }
  }
}

export function localProcessSandbox(
  config: LocalProcessSandboxConfig = {},
): SandboxProvider {
  return new LocalProcessProvider(config)
}
