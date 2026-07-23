import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

test.describe('provider tools — custom-name wire dispatch', () => {
  test.beforeEach(async ({ request, aimockPort }) => {
    await request.delete(`http://127.0.0.1:${aimockPort}/v1/_requests`)
  })

  test('OpenAI preserves web_search as a function tool', async ({
    request,
    aimockPort,
    testId,
  }) => {
    await runWireRoute(request, 'openai', testId)
    const body = await readCapturedBody(request, aimockPort)
    const tools = body['tools'] as Array<Record<string, unknown>> | undefined

    expect(tools).toContainEqual(
      expect.objectContaining({
        type: 'function',
        name: 'web_search',
      }),
    )
  })

  test('Gemini preserves google_search as a function declaration', async ({
    request,
    aimockPort,
    testId,
  }) => {
    await runWireRoute(request, 'gemini', testId)
    const body = await readCapturedBody(request, aimockPort)
    const tools = body['tools'] as Array<Record<string, unknown>> | undefined

    expect(tools).toContainEqual(
      expect.objectContaining({
        functionDeclarations: [
          expect.objectContaining({ name: 'google_search' }),
        ],
      }),
    )
    expect(tools).not.toContainEqual(
      expect.objectContaining({ googleSearch: expect.anything() }),
    )
  })
})

async function runWireRoute(
  request: APIRequestContext,
  provider: 'gemini' | 'openai',
  testId: string,
) {
  const response = await request.post(
    `/api/provider-tool-dispatch-wire?provider=${provider}&testId=${encodeURIComponent(testId)}`,
  )
  expect(response.ok()).toBe(true)
  const result = (await response.json()) as { ok: boolean; error?: string }
  expect(result, result.error).toMatchObject({ ok: true })
}

async function readCapturedBody(
  request: APIRequestContext,
  aimockPort: number,
): Promise<Record<string, unknown>> {
  const response = await request.get(
    `http://127.0.0.1:${aimockPort}/v1/_requests`,
  )
  const entries = (await response.json()) as Array<{
    body: Record<string, unknown> | null
  }>
  return entries[0]?.body ?? {}
}
