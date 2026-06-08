// NOTE: This module is exposed ONLY via the `@tanstack/ai/adapter-internals`
// subpath export. It gives provider adapter packages access to the internal
// logger plumbing without leaking those symbols to end users.

export type { ResolvedCategories } from './logger/internal-logger'
export { InternalLogger } from './logger/internal-logger'
export type { Logger } from './logger/types'
export { resolveDebugOption } from './logger/resolve'
export {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from './activities/error-payload'
