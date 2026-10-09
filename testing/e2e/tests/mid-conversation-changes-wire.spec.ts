import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

const BETA = 'mid-conversation-tool-changes-2026-07-01'
const PLACEHOLDER = '__tanstack_deferred_placeholder__'

type WireCase = {
  name: string
  errors: Array<string>
  requestCount: number
  firstTools: Array<string>
  secondTools: Array<string>
  additionalTools: Array<string>
  toolAdditions: Array<string>
  deferred: Array<string>
  toolCacheMarks: Array<Array<string>>
  betas: Array<Array<string>>
  lastItem: string | null
}

/**
 * A middleware adds `get_forecast` after the first tool batch.
 * `/api/mid-conversation-changes-wire` runs that with the real adapters and a
 * capturing `fetch`. Returns a lookup of what each case's two requests held.
 */
async function casesFrom(request: APIRequestContext) {
  const response = await request.post('/api/mid-conversation-changes-wire')
  expect(response.ok()).toBe(true)
  const result = (await response.json()) as {
    ok: boolean
    error?: string
    cases: Array<WireCase>
  }
  if (!result.ok) throw new Error(`Route failed: ${result.error}`)
  return (name: string) => {
    const found = result.cases.find((entry) => entry.name === name)
    if (!found) throw new Error(`No case named ${name}`)
    return found
  }
}

/** The request of today: full tools, no placeholder, no beta, no change. */
function expectFullTools(plain: WireCase) {
  expect(plain.errors).toEqual([])
  expect(plain.requestCount).toBe(2)
  expect(plain.firstTools).toEqual(['get_weather'])
  expect(plain.secondTools).toEqual(['get_weather', 'get_forecast'])
  expect(plain.additionalTools).toEqual([])
  expect(plain.toolAdditions).toEqual([])
  expect(plain.deferred).toEqual([])
  expect(plain.betas.flat()).not.toContain(BETA)
}

test.describe('mid-conversation changes: a tool added after the first tool batch', () => {
  test('a GPT model with the channel sends it as additional_tools', async ({
    request,
  }) => {
    const gpt = (await casesFrom(request))('gpt-6-astra')
    expect(gpt.errors).toEqual([])
    expect(gpt.requestCount).toBe(2)
    expect(gpt.firstTools).toEqual(['get_weather'])
    // The start of the request stays the same.
    expect(gpt.secondTools).toEqual(['get_weather'])
    expect(gpt.additionalTools).toEqual(['get_forecast'])
    // The change comes after the tool result.
    expect(gpt.lastItem).toBe('additional_tools')
  })

  test('a Claude model with the channel sends a tool_addition block and the beta', async ({
    request,
  }) => {
    const claude = (await casesFrom(request))('claude-opus-5-5')
    expect(claude.errors).toEqual([])
    expect(claude.requestCount).toBe(2)
    expect(claude.firstTools).toEqual(['get_weather', PLACEHOLDER])
    expect(claude.secondTools).toEqual([
      'get_weather',
      PLACEHOLDER,
      'get_forecast',
    ])
    expect(claude.deferred).toEqual([PLACEHOLDER, 'get_forecast'])
    // The automatic prompt-cache marker sits on the last start tool, not on
    // the placeholder or the deferred tool, so the cached start stays put.
    expect(claude.toolCacheMarks).toEqual([['get_weather'], ['get_weather']])
    expect(claude.toolAdditions).toEqual(['get_forecast'])
    expect(claude.lastItem).toBe('system')
    expect(claude.betas).toHaveLength(2)
    for (const betas of claude.betas) expect(betas).toContain(BETA)
  })

  test('models without the channel send the full tools', async ({
    request,
  }) => {
    const caseOf = await casesFrom(request)
    // Both have `midConversationChannels: true`. The map still decides.
    expectFullTools(caseOf('gpt-6.1-sol'))
    expectFullTools(caseOf('claude-sonnet-5-5'))
  })

  test('a custom fetch with no option sends the full tools (the gateway case)', async ({
    request,
  }) => {
    // claude-opus-5-5 is in the map, but a custom fetch turns the default off.
    expectFullTools((await casesFrom(request))('claude-opus-5-5 gateway'))
  })
})
