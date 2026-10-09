import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

type WireResult = {
  ok: boolean
  error?: string
  text?: string
  wire?: {
    authorization: string | null
    xApiKey: string | null
    anthropicBeta: string | null
    xApp: string | null
    system?: unknown
  }
}

async function run(
  request: APIRequestContext,
  mode: 'api-key' | 'bearer' | 'oauth',
) {
  const res = await request.post(`/api/anthropic-auth-wire?mode=${mode}`)
  expect(res.ok()).toBe(true)
  const result = (await res.json()) as WireResult
  expect(result.error ?? null).toBeNull()
  expect(result.ok).toBe(true)
  expect(result.text).toBe('Hello from aimock')
  return result.wire
}

/**
 * The route records the headers and `system` field of the request that the
 * Anthropic SDK sends to aimock. The credentials are fake.
 */
test.describe('anthropic — auth on the wire', () => {
  test("auth: 'api-key' sends x-api-key and no Authorization", async ({
    request,
  }) => {
    const wire = await run(request, 'api-key')
    expect(wire).toMatchObject({
      authorization: null,
      xApiKey: 'sk-ant-e2e-test-dummy-key',
      anthropicBeta: null,
      xApp: null,
    })
  })

  test("auth: 'bearer' sends Authorization: Bearer and no x-api-key", async ({
    request,
  }) => {
    const wire = await run(request, 'bearer')
    expect(wire).toMatchObject({
      authorization: 'Bearer e2e-dummy-bearer-token',
      xApiKey: null,
      anthropicBeta: null,
      xApp: null,
    })
  })

  test("auth: 'oauth' adds the Claude Code betas, headers, and system block", async ({
    request,
  }) => {
    const wire = await run(request, 'oauth')
    expect(wire).toMatchObject({
      authorization: 'Bearer e2e-dummy-bearer-token',
      xApiKey: null,
      xApp: 'cli',
    })
    expect(wire?.anthropicBeta?.split(',')).toEqual([
      'claude-code-20250219',
      'oauth-2025-04-20',
    ])
    // The default prompt cache marks the system blocks, so the identity block
    // has the automatic cache marker too.
    expect(wire?.system).toEqual([
      {
        type: 'text',
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
        cache_control: { type: 'ephemeral' },
      },
    ])
  })
})
