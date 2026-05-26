// Setup file for SolidJS tests
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
