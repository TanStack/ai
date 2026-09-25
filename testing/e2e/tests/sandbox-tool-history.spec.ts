import { expect, test } from '@playwright/test'

/**
 * A finished sandbox run restores its TOOL CARDS on a reload, not just its verdict.
 *
 * A harness runs its tools inside the sandbox, so `chat()` only relays their
 * `TOOL_CALL_*` chunks and writes no assistant message for them. That left the tool
 * history in the delivery log alone: switching away and back replayed it (a live run
 * to rejoin), while a reload after completion hydrated from the message store and got
 * back only the prompt and the final text.
 *
 * The GET here is `reconstructChat` — the exact call a `persistence: true` client
 * makes on mount — so this asserts on the JSON a browser would receive.
 *
 * Provider-free (fixed AG-UI stream + fake sandbox provider); exempt from aimock.
 */
interface Part {
  type: string
  id?: string
  name?: string
  arguments?: string
  state?: string
  output?: unknown
  content?: string
  toolCallId?: string
}
interface Message {
  role: string
  parts: Array<Part>
}
interface Hydration {
  messages: Array<Message>
  activeRun: { runId: string } | null
}

test.describe('sandbox tool history survives a reload', () => {
  test('hydration returns the harness tool call, its arguments and its result', async ({
    request,
  }) => {
    const threadId = `tool-history-${Date.now()}`

    const run = await request.post('/api/sandbox-tool-history', {
      data: { threadId, runId: `run-${Date.now()}` },
    })
    expect(run.ok()).toBe(true)

    const hydrate = await request.get(
      `/api/sandbox-tool-history?threadId=${threadId}`,
    )
    expect(hydrate.ok()).toBe(true)
    const body = (await hydrate.json()) as Hydration

    // Nothing left to tail: this is the state a reload after completion lands in, so
    // the message store is the only possible source of what follows.
    expect(body.activeRun).toBeNull()

    const parts = body.messages.flatMap((message) => message.parts)
    const call = parts.find((part) => part.type === 'tool-call')
    expect(call?.name).toBe('bash')
    expect(call?.arguments).toBe('{"cmd":"ls packages"}')
    // `modelMessagesToUIMessages` completes the card by merging the stored
    // `role: 'tool'` message into the call it belongs to.
    expect(call?.state).toBe('complete')
    expect(call?.output).toBe('ai\nai-client\nai-sandbox')

    const result = parts.find((part) => part.type === 'tool-result')
    expect(result?.toolCallId).toBe(call?.id)
    expect(result?.content).toBe('ai\nai-client\nai-sandbox')

    // The verdict is still there — recording tool calls must not displace the
    // terminal text that persistence appends.
    const text = parts
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join(' ')
    expect(text).toContain('TOOL_HISTORY_OK')
  })
})
