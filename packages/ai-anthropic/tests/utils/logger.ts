import type { InternalLogger } from '@tanstack/ai/adapter-internals'

/** No-op logger for unit tests that exercise request mapping. */
export function createSilentLogger(): InternalLogger {
  const noop = () => {}
  return {
    isEnabled: () => false,
    request: noop,
    provider: noop,
    output: noop,
    middleware: noop,
    tools: noop,
    agentLoop: noop,
    config: noop,
    errors: noop,
    warn: noop,
  } as unknown as InternalLogger
}
