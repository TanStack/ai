import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * Wire format of the Anthropic computer toolset (`computer_toolset_20260801`).
 *
 * The model calls each action as its own tool (`left_click`, `screenshot`)
 * with `toolset_name: 'computer'`. The adapter runs each call as one
 * `computer` call with the action in `input.action`. On the next request it
 * sends each call back in the form that the model sent, and each result
 * names the toolset.
 *
 * `/api/anthropic-computer-toolset-wire` runs one loop against a custom
 * `fetch`, and returns the captured requests and the inputs that `execute`
 * got.
 */
interface WireResult {
  ok: boolean
  error?: string
  calls: Array<unknown>
  requests: Array<{
    anthropicBeta: string | null
    body: {
      tools: Array<Record<string, unknown>>
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>
    }
  }>
}

async function runLoop(request: APIRequestContext) {
  const res = await request.post('/api/anthropic-computer-toolset-wire')
  expect(res.ok()).toBe(true)
  const result = (await res.json()) as WireResult
  if (!result.ok) {
    throw new Error(`Route failed: ${result.error}`)
  }
  return result
}

test.describe('anthropic — computer toolset wire format', () => {
  test('sends the toolset entry with no name and no computer use beta', async ({
    request,
  }) => {
    const { requests } = await runLoop(request)
    const [first] = requests
    expect(first?.body.tools[0]).toMatchObject({
      type: 'computer_toolset_20260801',
      configs: { zoom: { enabled: false } },
    })
    expect(first?.body.tools[0]).not.toHaveProperty('name')
    expect(first?.anthropicBeta ?? '').not.toContain('computer-use')
  })

  test('runs each toolset call as one computer call', async ({ request }) => {
    const { calls } = await runLoop(request)
    expect(calls).toEqual([
      { action: 'left_click', coordinate: [500, 300] },
      { action: 'screenshot' },
    ])
  })

  test('sends the calls back as toolset calls, and the results name the toolset', async ({
    request,
  }) => {
    const { requests } = await runLoop(request)
    const second = requests[1]
    expect(second).toBeDefined()
    const assistant = second?.body.messages.find((m) => m.role === 'assistant')
    expect(assistant?.content).toMatchObject([
      {
        type: 'tool_use',
        id: 'toolu_click',
        name: 'left_click',
        toolset_name: 'computer',
        input: { coordinate: [500, 300] },
      },
      {
        type: 'tool_use',
        id: 'toolu_shot',
        name: 'screenshot',
        toolset_name: 'computer',
        input: {},
      },
    ])
    const results = second?.body.messages
      .flatMap((m) => m.content)
      .filter((block) => block['type'] === 'tool_result')
    expect(results).toMatchObject([
      { tool_use_id: 'toolu_click', toolset_name: 'computer', content: 'OK' },
      {
        tool_use_id: 'toolu_shot',
        toolset_name: 'computer',
        content: [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }],
      },
    ])
  })
})
