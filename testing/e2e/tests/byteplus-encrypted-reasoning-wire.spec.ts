import { test, expect } from './fixtures'

/** See `api.byteplus-encrypted-reasoning-wire.ts` for the scripted stream. */
test.describe('byteplus — encrypted reasoning on the wire', () => {
  test('encrypted_content names a reasoning message the client can find', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/byteplus-encrypted-reasoning-wire',
    )
    expect(response.ok()).toBe(true)
    const { reasoningIds, entityIds } = (await response.json()) as {
      reasoningIds: Array<string>
      entityIds: Array<string>
    }

    expect(entityIds).toHaveLength(1)
    // An AG-UI client attaches the value to the message with this id.
    expect(reasoningIds).toContain(entityIds[0])
  })
})
