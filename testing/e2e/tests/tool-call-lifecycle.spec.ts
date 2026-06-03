import { test, expect } from './fixtures'

/**
 * Issue #519 regression — `chat()` must not emit a duplicate `TOOL_CALL_END`
 * for server-executed tools.
 *
 * The adapter streams its own START/ARGS/END; pre-fix the post-execution phase
 * pushed a second END with no matching START, which `@ag-ui/client`'s
 * `verifyEvents` rejects. `/api/tool-call-lifecycle-wire` runs the real
 * `chat()` engine with a server tool and returns the emitted chunks.
 */
test.describe('chat() tool-call lifecycle (#519)', () => {
  test('emits exactly one TOOL_CALL_END per server-executed tool', async ({
    request,
  }) => {
    const res = await request.post('/api/tool-call-lifecycle-wire')
    expect(res.ok()).toBe(true)
    const { chunks, error } = (await res.json()) as {
      chunks: Array<Record<string, unknown>>
      error: string | null
    }

    expect(error).toBeNull()

    const idOf = (c: Record<string, unknown>) => c.toolCallId as string
    const starts = chunks.filter(
      (c) => c.type === 'TOOL_CALL_START' && idOf(c) === 'call_weather',
    )
    const ends = chunks.filter(
      (c) => c.type === 'TOOL_CALL_END' && idOf(c) === 'call_weather',
    )
    const results = chunks.filter(
      (c) => c.type === 'TOOL_CALL_RESULT' && idOf(c) === 'call_weather',
    )

    // Pre-fix `ends` was 2 (adapter + duplicate from buildToolResultChunks).
    expect(starts).toHaveLength(1)
    expect(ends).toHaveLength(1)
    expect(results).toHaveLength(1)

    // The server tool actually ran — its result reached the stream.
    expect(results[0]).toMatchObject({ content: expect.stringContaining('22') })

    // verifyEvents invariant: every END consumes a matching open START, so a
    // duplicate END for the same toolCallId finds none and fails here.
    const open = new Set<string>()
    for (const c of chunks) {
      if (c.type === 'TOOL_CALL_START') open.add(idOf(c))
      if (c.type === 'TOOL_CALL_END') {
        const id = idOf(c)
        expect(open.has(id)).toBe(true)
        open.delete(id)
      }
    }
  })
})
