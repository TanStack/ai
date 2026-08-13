// Setup file for SolidJS tests
// AudioRecorder tests call blob.arrayBuffer(), which jsdom lacks — pull in the
// shared polyfill (see packages/ai-client/tests/blob-polyfill.ts).
import '../../ai-client/tests/blob-polyfill'
// Mock createUniqueId to work in test environment
import { vi } from 'vitest'

let idCounter = 0

vi.mock('solid-js', async () => {
  const actual = await vi.importActual('solid-js')
  return {
    ...actual,
    createUniqueId: () => `test-id-${idCounter++}`,
  }
})
