import { test, expect } from './fixtures'

/**
 * Wire-format verification for the OpenAI provider-skills feature.
 *
 * When a `shellTool` is created with a `container_auto` environment carrying a
 * skill reference, the OpenAI text adapter (Responses API) must serialize the
 * tool as `{ type: 'shell', environment: { type: 'container_auto', skills: [...] } }`
 * in the outgoing `tools[]` array.
 *
 * This spec drives `/api/openai-shell-skills-wire` which intercepts the
 * outgoing SDK request via a custom `fetch`, captures the request body, and
 * returns it as JSON so we can assert the exact wire shape without needing a
 * real OpenAI API key.
 *
 * Note: `SkillReference.version` is typed as `string` in the OpenAI SDK, so
 * the version value here is the string `'2'`, not the number `2`.
 */
test.describe('openai — shell tool skills wire format', () => {
  test('shell tool with container_auto + skills is serialized correctly on the wire', async ({
    request,
  }) => {
    const res = await request.post('/api/openai-shell-skills-wire')
    expect(res.ok()).toBe(true)
    const { ok, error, capturedRequest } = (await res.json()) as {
      ok: boolean
      error?: string
      capturedRequest: {
        url: string
        headers: Record<string, string>
        body: Record<string, unknown> | null
      } | null
    }

    if (!ok) {
      throw new Error(`Route failed: ${error}`)
    }

    expect(capturedRequest).not.toBeNull()
    const body = capturedRequest?.body as Record<string, unknown>
    expect(body).not.toBeNull()

    const tools = body['tools'] as Array<Record<string, unknown>> | undefined
    expect(Array.isArray(tools)).toBe(true)

    const shellTool = tools?.find((t) => t['type'] === 'shell')
    expect(shellTool).toBeDefined()
    expect(shellTool).toMatchObject({
      type: 'shell',
      environment: {
        type: 'container_auto',
        skills: [
          {
            type: 'skill_reference',
            skill_id: 'skill_abc',
            version: '2',
          },
        ],
      },
    })
  })

  test('free-form map tools use the non-strict wire format', async ({
    request,
  }) => {
    const res = await request.post('/api/openai-shell-skills-wire')
    expect(res.ok()).toBe(true)
    const { ok, error, capturedRequest } = (await res.json()) as {
      ok: boolean
      error?: string
      capturedRequest: {
        body: Record<string, unknown> | null
      } | null
    }

    if (!ok) {
      throw new Error(`Route failed: ${error}`)
    }

    const body = capturedRequest?.body
    const tools = body?.['tools'] as Array<Record<string, unknown>> | undefined
    const mapTool = tools?.find((tool) => tool['name'] === 'store_labels')

    expect(mapTool).toMatchObject({
      type: 'function',
      name: 'store_labels',
      strict: false,
      parameters: {
        properties: {
          labels: {
            additionalProperties: { type: 'string' },
          },
        },
      },
    })
  })
})
