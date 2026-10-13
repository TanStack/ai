import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createMistralText } from '../src/adapters/text'
import type { TextOptions, Tool, ToolChoice } from '@tanstack/ai'
import type { MistralTextProviderOptions } from '../src/adapters/text'

const logger = resolveDebugOption(false)
const model = 'mistral-large-latest'

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

const sse = `data: ${JSON.stringify({
  id: 'cmpl-1',
  model,
  choices: [{ index: 0, delta: { content: 'Done' }, finish_reason: 'stop' }],
})}\n\ndata: [DONE]\n\n`

type CallOptions = Pick<
  TextOptions<MistralTextProviderOptions>,
  'tools' | 'toolChoice' | 'modelOptions'
>

/**
 * Runs one streaming call and returns the JSON body sent over HTTP. The
 * stream path calls the global `fetch` directly, not the SDK.
 */
async function sentBody(options: CallOptions) {
  let body: unknown
  vi.stubGlobal('fetch', async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    return new Response(sse, {
      headers: { 'content-type': 'text/event-stream' },
    })
  })
  const adapter = createMistralText(model, 'test-key')
  for await (const _ of adapter.chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'Weather in Paris?' }],
    ...options,
  })) {
    // drain
  }
  return body
}

interface Row {
  label: string
  toolChoice: ToolChoice
  expected: unknown
}

const shapes: Array<Row> = [
  { label: 'auto', toolChoice: 'auto', expected: 'auto' },
  { label: 'none', toolChoice: 'none', expected: 'none' },
  { label: 'required', toolChoice: 'required', expected: 'required' },
  {
    label: 'a named tool',
    toolChoice: { type: 'tool', name: 'lookup_weather' },
    expected: { type: 'function', function: { name: 'lookup_weather' } },
  },
]

describe('Mistral tool_choice', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(shapes)('sends $label', async ({ toolChoice, expected }) => {
    const body = await sentBody({ tools: [weatherTool], toolChoice })
    expect(body).toHaveProperty('tool_choice', expected)
  })

  it('sends no tool_choice when the request has no tools', async () => {
    const body = await sentBody({ toolChoice: 'required' })
    expect(body).toHaveProperty('model')
    expect(body).not.toHaveProperty('tool_choice')
  })

  it('lets a tool_choice in modelOptions win', async () => {
    const body = await sentBody({
      tools: [weatherTool],
      toolChoice: 'required',
      modelOptions: { tool_choice: 'none' },
    })
    expect(body).toHaveProperty('tool_choice', 'none')
  })
})
