/**
 * @tanstack/ai-isolate-cloudflare
 *
 * Cloudflare Workers driver for TanStack AI Code Mode.
 * Execute LLM-generated code on Cloudflare's global edge network.
 *
 * @example
 * ```typescript
 * import { createCloudflareIsolateDriver } from '@tanstack/ai-isolate-cloudflare'
 *
 * const driver = createCloudflareIsolateDriver({
 *   workerUrl: 'https://your-worker.workers.dev',
 * })
 * ```
 *
 * @packageDocumentation
 */

export {
  createCloudflareIsolateDriver,
  type CloudflareIsolateDriverConfig,
} from './isolate-driver'

export type {
  ExecuteRequest,
  ExecuteResponse,
  ToolSchema,
  ToolCallRequest,
  ToolResultPayload,
} from './types'
