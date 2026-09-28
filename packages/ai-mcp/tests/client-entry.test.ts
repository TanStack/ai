import { expect, it, vi } from 'vitest'

// A client-only app installs @modelcontextprotocol/client only.
// If the main entry loads the server SDK, this mock throws.
vi.mock('@modelcontextprotocol/server', () => {
  throw new Error('The main entry loaded @modelcontextprotocol/server.')
})

it('loads the main entry without the server SDK', async () => {
  const entry = await import('../src/index')
  expect(entry.createMCPClient).toBeTypeOf('function')
})
