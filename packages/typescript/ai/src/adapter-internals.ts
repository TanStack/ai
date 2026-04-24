// NOTE: This module is exposed ONLY via the `@tanstack/ai/adapter-internals`
// subpath export. It gives provider adapter packages access to the internal
// logger plumbing without leaking those symbols to end users.

export type { ResolvedCategories } from './logger/internal-logger'
export { InternalLogger } from './logger/internal-logger'
export { resolveDebugOption } from './logger/resolve'
