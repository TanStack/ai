/**
 * Test-only hook: replace the no-op devtools factories with the real
 * ones so the existing test suite (which asserts on emitted devtools
 * events) keeps working under the new "no-op by default" architecture.
 *
 * Production consumers must explicitly opt in via
 * `@tanstack/ai-client/devtools`; the tests do that here once per file.
 */
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
