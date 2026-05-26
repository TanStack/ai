// Test-only: replace the no-op devtools factories with the real ones so
// the existing test suite (which asserts on emitted devtools events) keeps
// working under the no-op-by-default architecture. Production consumers
// opt in via `@tanstack/ai-client/devtools`.
import { vi } from 'vitest'

vi.mock('../src/devtools-noop', async () => {
  const real =
    await vi.importActual<typeof import('../src/devtools')>('../src/devtools')
  return {
    createNoOpChatDevtoolsBridge: real.createChatDevtoolsBridge,
    createNoOpGenerationDevtoolsBridge: real.createGenerationDevtoolsBridge,
    createNoOpVideoDevtoolsBridge: real.createVideoDevtoolsBridge,
  }
})
