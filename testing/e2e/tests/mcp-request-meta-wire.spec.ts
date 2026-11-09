import { test, expect } from './fixtures'

test.describe('mcp: request _meta on the wire', () => {
  test('sends caller meta and drops reserved keys', async ({ request }) => {
    const response = await request.post('/api/mcp-request-meta-wire')
    expect(response.ok()).toBe(true)
    const result: unknown = await response.json()

    // The client sent 'mcp.dev/blocked' too. It is a reserved key, so the
    // server must not get it.
    const t1 = { 'acme.com/tenant': 't1' }
    const chatMeta = (method: string) => ({
      'acme.com/tenant': 't3',
      'acme.com/method': method,
      'acme.com/serverId': 'meta',
    })
    expect(result).toEqual({
      direct: [
        { method: 'tools/call', meta: t1 },
        { method: 'resources/read', meta: t1 },
        { method: 'prompts/get', meta: t1 },
      ],
      handler: [{ method: 'tools/call', meta: { 'acme.com/tenant': 't2' } }],
      chat: [
        { method: 'tools/call', meta: chatMeta('tools/call') },
        { method: 'resources/read', meta: chatMeta('resources/read') },
      ],
    })
  })
})
