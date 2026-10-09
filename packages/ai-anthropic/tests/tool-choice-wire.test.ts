import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createAnthropicChat } from '../src/adapters/text'
import type { TextOptions, Tool, ToolChoice } from '@tanstack/ai'
import type { AnthropicChatModel } from '../src/model-meta'
import type { AnthropicToolChoiceOptions } from '../src/text/text-provider-options'

const logger = resolveDebugOption(false)
// Takes a forced tool, and can turn thinking on and off.
const haiku = 'claude-haiku-4-5'
// Rejects a forced tool on every request.
const opus = 'claude-opus-5-5'

const weatherTool: Tool = {
  name: 'lookup_weather',
  description: 'Return the forecast for a location',
}

const sse = [
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Done' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]
  .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  .join('')

let lastBody: unknown
const captureFetch: typeof globalThis.fetch = async (input, init) => {
  lastBody = await new Request(input, init).json()
  return new Response(sse, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

type CallOptions = Pick<
  TextOptions<AnthropicToolChoiceOptions>,
  'tools' | 'toolChoice' | 'modelOptions' | 'reasoning'
>

/** Runs one streaming call and returns the JSON body sent over HTTP. */
async function sentBody(model: AnthropicChatModel, options: CallOptions) {
  lastBody = undefined
  const adapter = createAnthropicChat(model, 'test-key', {
    fetch: captureFetch,
  })
  for await (const _ of adapter.chatStream({
    logger,
    model,
    messages: [{ role: 'user', content: 'Weather in Paris?' }],
    ...options,
  })) {
    // drain
  }
  return lastBody
}

interface Row {
  label: string
  toolChoice: ToolChoice
  expected: object
}

const named: ToolChoice = { type: 'tool', name: 'lookup_weather' }

const shapes: Array<Row> = [
  { label: 'auto', toolChoice: 'auto', expected: { type: 'auto' } },
  { label: 'none', toolChoice: 'none', expected: { type: 'none' } },
  { label: 'required', toolChoice: 'required', expected: { type: 'any' } },
  {
    label: 'a named tool',
    toolChoice: named,
    expected: { type: 'tool', name: 'lookup_weather' },
  },
]

const thinkingShapes: Array<Row> = [
  { label: 'required', toolChoice: 'required', expected: { type: 'auto' } },
  { label: 'a named tool', toolChoice: named, expected: { type: 'auto' } },
  { label: 'none', toolChoice: 'none', expected: { type: 'none' } },
]

const noForcedToolShapes: Array<Row> = [
  { label: 'required', toolChoice: 'required', expected: { type: 'auto' } },
  { label: 'none', toolChoice: 'none', expected: { type: 'none' } },
]

describe('Anthropic tool_choice', () => {
  it.each(shapes)('sends $label', async ({ toolChoice, expected }) => {
    const body = await sentBody(haiku, { tools: [weatherTool], toolChoice })
    expect(body).toHaveProperty('tool_choice', expected)
  })

  it('lets a tool_choice in modelOptions win', async () => {
    const body = await sentBody(haiku, {
      tools: [weatherTool],
      toolChoice: 'required',
      modelOptions: { tool_choice: { type: 'auto' } },
    })
    expect(body).toHaveProperty('tool_choice', { type: 'auto' })
  })

  it('sends no tool_choice when the request has no tools', async () => {
    const body = await sentBody(haiku, { toolChoice: 'required' })
    expect(body).not.toHaveProperty('tool_choice')
  })

  it.each(thinkingShapes)(
    'with thinking on, sends $label without forcing a tool',
    async ({ toolChoice, expected }) => {
      const body = await sentBody(haiku, {
        tools: [weatherTool],
        toolChoice,
        reasoning: { level: 'high', summary: false },
      })
      expect(body).toHaveProperty('thinking.type', 'enabled')
      expect(body).toHaveProperty('tool_choice', expected)
    },
  )

  it('with thinking off, still forces the tool', async () => {
    const body = await sentBody(haiku, {
      tools: [weatherTool],
      toolChoice: 'required',
      reasoning: { level: 'off', summary: false },
    })
    expect(body).toHaveProperty('thinking', { type: 'disabled' })
    expect(body).toHaveProperty('tool_choice', { type: 'any' })
  })

  it.each(noForcedToolShapes)(
    'on a model that cannot force a tool, sends $label without forcing',
    async ({ toolChoice, expected }) => {
      const body = await sentBody(opus, { tools: [weatherTool], toolChoice })
      expect(body).not.toHaveProperty('thinking')
      expect(body).toHaveProperty('tool_choice', expected)
    },
  )
})
