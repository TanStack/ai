import { createCapability } from './capabilities'
import type { InternalLogger } from '../../../logger/internal-logger'
import type { SandboxFileHookEvent } from './types'

export interface SandboxRuntime {
  emit: (event: SandboxFileHookEvent) => void
  /** Emit an opt-in per-file `sandbox.file.diff` CUSTOM chunk. */
  emitFileDiff: (value: { path: string; diff: string }) => void
  logger: InternalLogger
}

export const SandboxRuntimeCapability =
  createCapability<SandboxRuntime>()('sandbox-runtime')

export const [getSandboxRuntime, provideSandboxRuntime] =
  SandboxRuntimeCapability
