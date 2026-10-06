import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * Wire-format verification for `chat({ toolChoice })`.
 *
 * OpenAI runs through `/api/chat` and aimock. The `tool-choice` feature asks
 * for the named tool `getGuitars`, and aimock's journal keeps `tool_choice`
 * for Responses requests, so the spec reads it back from there.
 *
 * aimock stores Anthropic requests in OpenAI shape and drops `tool_choice`.
 * The Anthropic cases use `/api/tool-choice-wire`, which captures the request
 * body with a custom `fetch`.
 */
test.describe('tool choice — wire format', () => {
  test('openai sends a named tool as a function tool_choice', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/chat', {
      data: {
        threadId: 'thread-tool-choice-1',
        runId: 'run-tool-choice-1',
        state: {},
        messages: [
          {
            id: 'u1',
            role: 'user',
            content: '[toolchoice] what guitars do you have in stock',
          },
        ],
        tools: [],
        context: [],
        forwardedProps: {
          provider: 'openai',
          feature: 'tool-choice',
          testId,
          aimockPort,
        },
      },
    })
    expect(
      response.ok(),
      `expected 200, got ${response.status()}: ${await response.text()}`,
    ).toBe(true)
    const text = await response.text()
    expect(text).toContain('RUN_FINISHED')
    expect(text).not.toContain('RUN_ERROR')

    const bodies = await readCapturedBodies(request, aimockPort, testId)

    // The first request of the run carries the caller's choice.
    expect(bodies[0]).toHaveProperty('tool_choice', {
      type: 'function',
      name: 'getGuitars',
    })
  })

  const anthropicCases = [
    {
      model: 'claude-sonnet-4-5',
      label: 'forces the named tool',
      expected: { type: 'tool', name: 'getGuitars' },
    },
    {
      // This model rejects a forced tool, so the adapter falls back to auto.
      model: 'claude-opus-5-5',
      label: 'falls back to auto',
      expected: { type: 'auto' },
    },
  ]

  for (const { model, label, expected } of anthropicCases) {
    test(`anthropic ${model} ${label}`, async ({ request }) => {
      const response = await request.post('/api/tool-choice-wire', {
        data: { model },
      })
      expect(response.ok()).toBe(true)
      const payload: {
        ok: boolean
        error?: string
        capturedBodies: Array<unknown>
      } = await response.json()
      expect(payload, payload.error).toMatchObject({ ok: true })

      expect(payload.capturedBodies).toHaveLength(1)
      expect(payload.capturedBodies[0]).toHaveProperty('tool_choice', expected)
    })
  }
})

/**
 * Reads the request bodies this test's own run sent to aimock, oldest first.
 *
 * aimock is a singleton shared by every Playwright worker, so select this
 * test's entries by the `X-Test-Id` header that `createTextAdapter` adds, the
 * same as `provider-tool-dispatch-wire.spec.ts`.
 */
async function readCapturedBodies(
  request: APIRequestContext,
  aimockPort: number,
  testId: string,
): Promise<Array<unknown>> {
  const response = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries: Array<{
    headers?: Record<string, string>
    body: unknown
  }> = await response.json()

  const mine = entries.filter((entry) =>
    Object.entries(entry.headers ?? {}).some(
      ([key, value]) => key.toLowerCase() === 'x-test-id' && value === testId,
    ),
  )

  expect(
    mine,
    `no aimock journal entry carried X-Test-Id "${testId}"`,
  ).not.toHaveLength(0)

  return mine.map((entry) => entry.body)
}
