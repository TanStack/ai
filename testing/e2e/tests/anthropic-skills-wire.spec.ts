import { test, expect } from './fixtures'

/**
 * Wire-format verification for the Anthropic provider-skills feature.
 *
 * When a `codeExecutionTool` is created with a hosted skill reference, the
 * Anthropic text adapter must:
 *
 * 1. Add `code-execution-2025-08-25` AND `skills-2025-10-02` to the
 *    `anthropic-beta` HTTP request header (via the SDK's `betas` parameter).
 * 2. Lift the skill reference into the top-level `container.skills` request
 *    body param (NOT into the `tools[]` entry).
 *
 * This spec drives `/api/anthropic-skills-wire` which intercepts the outgoing
 * SDK request via a custom `fetch`, captures headers + body, and returns them
 * as JSON so we can assert the exact wire shape without needing a real
 * Anthropic API key.
 */
test.describe('anthropic — code_execution skills wire format', () => {
  test('anthropic-beta header includes code-execution-2025-08-25 and skills-2025-10-02', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-skills-wire')
    expect(res.ok()).toBe(true)
    const { ok, error, capturedRequest } = (await res.json()) as {
      ok: boolean
      error?: string
      capturedRequest: {
        url: string
        headers: Record<string, string>
        body: unknown
      } | null
    }

    if (!ok) {
      throw new Error(`Route failed: ${error}`)
    }

    expect(capturedRequest).not.toBeNull()
    const betaHeader = capturedRequest?.headers['anthropic-beta'] ?? ''
    expect(betaHeader).toContain('code-execution-2025-08-25')
    expect(betaHeader).toContain('skills-2025-10-02')
  })

  test('request body container.skills contains the skill reference', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-skills-wire')
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

    const container = body['container'] as
      | { skills?: Array<Record<string, unknown>> }
      | undefined
    expect(container).toBeDefined()
    expect(Array.isArray(container?.skills)).toBe(true)
    expect(container?.skills).toContainEqual({
      type: 'anthropic',
      skill_id: 'pptx',
      version: 'latest',
    })
  })

  test('an ordinary function named web_search stays a custom tool', async ({
    request,
  }) => {
    const res = await request.post('/api/anthropic-skills-wire')
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

    const tools = capturedRequest?.body?.['tools'] as
      | Array<Record<string, unknown>>
      | undefined
    const customTool = tools?.find((tool) => tool['name'] === 'web_search')

    expect(customTool).toMatchObject({
      name: 'web_search',
      type: 'custom',
      description: 'Search an application index',
      input_schema: {
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    })
  })
})
