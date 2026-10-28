/**
 * @tanstack/ai-isolate-e2b
 *
 * E2B sandbox driver for TanStack AI Code Mode. Runs generated code in a
 * caller-provided E2B sandbox; tool implementations stay on the host.
 *
 * @example
 * ```typescript
 * import { Sandbox } from 'e2b'
 * import { createE2BIsolateDriver } from '@tanstack/ai-isolate-e2b'
 *
 * const sandbox = await Sandbox.create()
 * const driver = createE2BIsolateDriver({ sandbox })
 * ```
 *
 * @packageDocumentation
 */

export {
  createE2BIsolateDriver,
  type E2BCommandHandleLike,
  type E2BIsolateDriverConfig,
  type E2BSandboxLike,
} from './isolate-driver'
