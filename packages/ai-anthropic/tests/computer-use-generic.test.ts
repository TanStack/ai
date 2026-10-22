import { beforeEach, describe, expect, it, vi } from 'vitest'
import { brandProviderTool, chat } from '@tanstack/ai'
import { createAnthropicChat } from '../src/adapters/text'
import { resolveComputerUseTool } from '../src/tools/computer-use-tool'
import type { ProviderTool } from '@tanstack/ai'
import type { ComputerUseToolMetadata } from '@tanstack/ai/adapter-internals'
import type { TextActivityOptions } from '@tanstack/ai/adapters'

const mocks = vi.hoisted(() => {
  const betaMessagesCreate = vi.fn()
  const client = { beta: { messages: { create: betaMessagesCreate } } }
  return { betaMessagesCreate, client }
})

vi.mock('@anthropic-ai/sdk', () => {
  const { client } = mocks
  class MockAnthropic {
    beta = client.beta
    constructor(_: { apiKey: string }) {}
  }
  return { default: MockAnthropic }
})

function stream(events: Array<unknown>) {
  mocks.betaMessagesCreate.mockResolvedValueOnce(
    (async function* () {
      yield* events
    })(),
  )
}

/** A computer toolset call, as the model streams it. */
function memberCall(index: number, id: string, name: string, json: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id,
        name,
        toolset_name: 'computer',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: json },
    },
    { type: 'content_block_stop', index },
  ]
}

const end = (stopReason: string) => [
  {
    type: 'message_delta',
    delta: { stop_reason: stopReason },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

type Capabilities = ComputerUseToolMetadata['capabilities']

const NO_EXTRAS: Capabilities = { zoom: false, cursorPosition: false }

/** The generic tool, as `@tanstack/ai-computer-use` builds it. */
function computerTool(
  capabilities: Capabilities = NO_EXTRAS,
  execute: (input: unknown) => unknown = () => 'OK',
) {
  return brandProviderTool<ProviderTool<string, 'computer'>>({
    name: 'computer',
    description: 'Use the computer.',
    metadata: {
      __kind: 'computer_use',
      display: { width: 1280, height: 800 },
      environment: 'browser',
      capabilities,
    },
    execute,
  })
}

type ComputerModel = 'claude-opus-5-5' | 'claude-opus-4-6' | 'claude-sonnet-4-5'

/** The `tools` and `betas` of the first request for one computer tool. */
async function firstRequest(model: ComputerModel, capabilities: Capabilities) {
  stream(end('end_turn'))
  for await (const _ of chat({
    threadId: 'thread-1',
    adapter: createAnthropicChat(model, 'k'),
    messages: [{ role: 'user', content: 'Open the settings.' }],
    tools: [computerTool(capabilities)],
  })) {
    // consume
  }
  const [payload] = mocks.betaMessagesCreate.mock.calls[0]!
  return { tools: payload.tools, betas: payload.betas }
}

/** Type helper: the `tools` that `chat()` accepts for this adapter. */
function typedTools<TAdapter extends ReturnType<typeof createAnthropicChat>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

beforeEach(() => {
  mocks.betaMessagesCreate.mockReset()
})

describe('anthropic generic computer tool', () => {
  it.each([
    {
      capabilities: { zoom: true, cursorPosition: false },
      configs: { zoom: { enabled: true }, cursor_position: { enabled: false } },
    },
    {
      capabilities: { zoom: false, cursorPosition: true },
      configs: { zoom: { enabled: false }, cursor_position: { enabled: true } },
    },
  ])(
    'sends the toolset with configs $configs on claude-opus-5-5',
    async ({ capabilities, configs }) => {
      const { tools, betas } = await firstRequest(
        'claude-opus-5-5',
        capabilities,
      )

      expect(tools).toHaveLength(1)
      expect(tools[0]).toMatchObject({
        type: 'computer_toolset_20260801',
        configs,
      })
      expect(tools[0].configs).toEqual(configs)
      expect(tools[0]).not.toHaveProperty('name')
      expect(betas).toBeUndefined()
    },
  )

  it('sends computer_20251124 with enable_zoom on claude-opus-4-6', async () => {
    const { tools, betas } = await firstRequest('claude-opus-4-6', {
      zoom: true,
      cursorPosition: false,
    })

    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      type: 'computer_20251124',
      name: 'computer',
      display_width_px: 1280,
      display_height_px: 800,
      enable_zoom: true,
    })
    expect(betas).toContain('computer-use-2025-11-24')
  })

  it('sends computer_20250124 on claude-sonnet-4-5', async () => {
    const { tools, betas } = await firstRequest('claude-sonnet-4-5', NO_EXTRAS)

    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({
      type: 'computer_20250124',
      name: 'computer',
      display_width_px: 1280,
      display_height_px: 800,
    })
    expect(tools[0]).not.toHaveProperty('enable_zoom')
    expect(betas).toContain('computer-use-2025-01-24')
  })

  it('runs the generic execute for each toolset call and sends the results back', async () => {
    stream([
      ...memberCall(0, 'toolu_click', 'left_click', '{"coordinate":[500,300]}'),
      ...end('tool_use'),
    ])
    stream(end('end_turn'))
    const calls: Array<unknown> = []
    const tool = computerTool(NO_EXTRAS, (input) => {
      calls.push(input)
      return 'OK'
    })

    for await (const _ of chat({
      threadId: 'thread-1',
      adapter: createAnthropicChat('claude-opus-5-5', 'k'),
      messages: [{ role: 'user', content: 'Click the button.' }],
      tools: [tool],
    })) {
      // consume
    }

    expect(calls).toEqual([{ action: 'left_click', coordinate: [500, 300] }])
    const [payload] = mocks.betaMessagesCreate.mock.calls[1]!
    const [, assistant, results] = payload.messages
    expect(assistant.content).toEqual([
      {
        type: 'tool_use',
        id: 'toolu_click',
        name: 'left_click',
        toolset_name: 'computer',
        input: { coordinate: [500, 300] },
      },
    ])
    expect(results.content).toMatchObject([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_click',
        toolset_name: 'computer',
        content: 'OK',
      },
    ])
  })

  it.each(['claude-opus-5-fast', 'claude-opus-4-5@20251101'])(
    'throws for %s, which has no computer version in the model meta',
    (model) => {
      expect(() => resolveComputerUseTool(computerTool(), model)).toThrow(
        `Model "${model}" does not support computer use.`,
      )
    },
  )

  it('returns a tool with no computer metadata unchanged', () => {
    const tool = { name: 'echo', description: 'Echo the input.' }

    expect(resolveComputerUseTool(tool, 'claude-opus-5-fast')).toBe(tool)
  })

  it('types: chat() takes the generic tool only on a model with a computer version', () => {
    typedTools(createAnthropicChat('claude-opus-5-5', 'k'), [computerTool()])
    typedTools(createAnthropicChat('claude-opus-5-fast', 'k'), [
      // @ts-expect-error - claude-opus-5-fast has no computer version
      computerTool(),
    ])
  })
})
