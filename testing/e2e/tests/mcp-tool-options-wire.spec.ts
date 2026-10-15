import { test, expect } from './fixtures'

test.describe('mcp: toolName and a strict toolFilter list', () => {
  test('names tools with toolName and fails on a missing listed name', async ({
    request,
  }) => {
    const response = await request.post('/api/mcp-tool-options-wire')
    expect(response.ok()).toBe(true)
    const result: unknown = await response.json()

    expect(result).toEqual({
      names: ['mcp__store__get_guitar_price'],
      missing: ['no_such_tool'],
      errorName: 'MCPToolFilterError',
    })
  })
})
