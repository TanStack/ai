/**
 * Internal runtime seam the chat engine PROVIDES so the sandbox middleware can
 * surface file events without a public ctx method. `emit` runs every
 * middleware's `sandbox` hooks AND emits a CUSTOM `sandbox.file` chunk into the
 * stream; `logger` lets the sandbox layer log under the `sandbox` debug
 * category. Consumed (optionally) by `withSandbox` in `@tanstack/ai-sandbox`.
 */
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
