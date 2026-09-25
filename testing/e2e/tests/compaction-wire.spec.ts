import { expect, test } from './fixtures'

/**
 * Wire-format verification for `withCompaction`. Drives `/api/compaction-wire`,
 * which sends a long history through `chat()` with a small `maxTokens` and
 * captures the outgoing SDK request. The captured body must show the oldest
 * message evicted, the compaction note injected, and the recent tail preserved.
 */
test.describe('withCompaction — wire format', () => {
  test('evicts the old head, keeps the recent tail, injects a note', async ({
    request,
  }) => {
    const response = await request.post('/api/compaction-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      firstRequestBody: unknown
      secondRequestBody: unknown
      canonicalMessages: unknown
      compactionCount: number
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    const wire = JSON.stringify(result.firstRequestBody)
    // Recent tail is preserved verbatim.
    expect(wire).toContain('KEEP_ME_LAST')
    // The dropped head was replaced by the eviction note.
    expect(wire).toContain('omitted to save context')
    // The oldest message is gone.
    expect(wire).not.toContain('SECRET_ALPHA_ONE')

    // Persistence keeps the canonical transcript, while a later request reuses
    // the compacted checkpoint without compacting the same prefix again.
    expect(JSON.stringify(result.canonicalMessages)).toContain(
      'SECRET_ALPHA_ONE',
    )
    expect(JSON.stringify(result.secondRequestBody)).not.toContain(
      'SECRET_ALPHA_ONE',
    )
    expect(result.compactionCount).toBe(1)
  })

  test('clearToolResults stubs old tool output and keeps the recent one', async ({
    request,
  }) => {
    const response = await request.post('/api/compaction-wire?strategy=clear')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      firstRequestBody: unknown
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    const wire = JSON.stringify(result.firstRequestBody)
    // The most recent tool result is preserved verbatim.
    expect(wire).toContain('KEEP_TOOL_BETA')
    // The old tool result content is replaced by the stub.
    expect(wire).toContain('tool output cleared')
    // The old tool result content is gone.
    expect(wire).not.toContain('SECRET_TOOL_ALPHA')
  })
})
