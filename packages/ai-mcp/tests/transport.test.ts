import { describe, expect, it } from 'vitest'
import { resolveTransport } from '../src/transport'

describe('resolveTransport', () => {
  it('builds a Streamable HTTP transport from config', async () => {
    const t = await resolveTransport({
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer x' },
    })
    expect(t).toBeDefined()
    expect(t.constructor.name).toMatch(/StreamableHTTP/)
  })

  it('passes through a user-supplied transport instance', async () => {
    const fake = {
      start: async () => {},
      send: async () => {},
      close: async () => {},
    }
    const t = await resolveTransport(fake as any)
    expect(t).toBe(fake)
  })

  it('throws a clear error for stdio without the /stdio import', async () => {
    await expect(
      resolveTransport({ type: 'stdio', command: 'node', args: [] }),
    ).rejects.toThrow(/@tanstack\/ai-mcp\/stdio/)
  })
})
