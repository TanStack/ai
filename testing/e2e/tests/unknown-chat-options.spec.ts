import { test, expect } from './fixtures'

test.describe('chat() unknown top-level options (#1073)', () => {
  test('warns when providerOptions is silently dropped', async ({
    request,
  }) => {
    const response = await request.get('/api/unknown-chat-options')

    expect(response.ok()).toBe(true)
    const body = (await response.json()) as { warnings: Array<string> }
    expect(body.warnings).toHaveLength(1)
    expect(body.warnings[0]).toContain('providerOptions')
    expect(body.warnings[0]).toContain('modelOptions')
  })
})
