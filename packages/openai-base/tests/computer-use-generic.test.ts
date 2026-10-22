import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { OpenAIBaseChatCompletionsTextAdapter } from '../src/adapters/chat-completions-text'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import { convertToolsToProviderFormat } from '../src/tools/tool-converter'
import type OpenAI from 'openai'
import type { StreamChunk, Tool } from '@tanstack/ai'

const safetyCheck = {
  id: 'sc_1',
  code: 'malicious_instructions',
  message: 'The page asks the model to do something else.',
}

async function* completed(output: Array<Record<string, unknown>>) {
  yield* [
    {
      type: 'response.created',
      response: { id: 'resp_1', model: 'm', status: 'in_progress' },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_1',
        model: 'm',
        status: 'completed',
        output,
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ]
}

const answer = {
  type: 'message',
  id: 'msg_1',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
}

const screenshot = [
  {
    type: 'image',
    source: { type: 'data', value: 'iVBORw0KGgo=', mimeType: 'image/png' },
  },
]

const screenshotOutput = {
  type: 'computer_screenshot',
  image_url: 'data:image/png;base64,iVBORw0KGgo=',
  detail: 'original',
}

// The stub clients below implement only the one SDK method the adapter calls.
// A full OpenAI client is too large to build, so they are cast.

// The OpenAI adapter sends provider tools in their native shape.
class TestAdapter extends OpenAIBaseResponsesTextAdapter<string> {
  protected override convertTools(tools: Array<Tool>) {
    return convertToolsToProviderFormat(tools)
  }
}

// The portable tool, as `@tanstack/ai-computer-use` builds it.
function genericComputerTool() {
  return {
    name: 'computer',
    description: 'Use the computer.',
    metadata: {
      __kind: 'computer_use',
      display: { width: 1280, height: 800 },
      environment: 'linux',
      capabilities: { zoom: false, cursorPosition: true },
    },
    execute: vi.fn(async (_input: unknown) => screenshot),
  } satisfies Tool
}

async function runLoop(model: string, call: Record<string, unknown>) {
  const create = vi
    .fn()
    .mockResolvedValueOnce(completed([call]))
    .mockResolvedValueOnce(completed([answer]))
  const client = {
    responses: { create: (params: unknown) => create(params) },
  } as unknown as OpenAI
  const tool = genericComputerTool()
  for await (const _ of chat({
    threadId: 'thread-1',
    adapter: new TestAdapter(model, 'openai', client),
    messages: [{ role: 'user', content: 'Click the button.' }],
    tools: [tool],
  })) {
    // Drain the stream.
  }
  const [first, second] = create.mock.calls.map(([params]) => params)
  return { first, second, execute: tool.execute }
}

describe('portable computer tool on the Responses API', () => {
  it('sends computer_use_preview to computer-use-preview and runs the single action', async () => {
    const action = { type: 'click', button: 'left', x: 10, y: 20 }
    const { first, second, execute } = await runLoop('computer-use-preview', {
      type: 'computer_call',
      id: 'cu_1',
      call_id: 'call_cu',
      status: 'completed',
      action,
      pending_safety_checks: [safetyCheck],
    })

    expect(first.tools).toEqual([
      {
        type: 'computer_use_preview',
        display_width: 1280,
        display_height: 800,
        environment: 'linux',
      },
    ])
    expect(execute.mock.calls[0]?.[0]).toEqual({
      action,
      pending_safety_checks: [safetyCheck],
    })
    expect(second.input).toContainEqual({
      type: 'computer_call_output',
      call_id: 'call_cu',
      output: screenshotOutput,
      acknowledged_safety_checks: [safetyCheck],
    })
  })

  it('sends the computer tool to other models and runs the batch', async () => {
    const actions = [
      { type: 'click', button: 'left', x: 10, y: 20 },
      { type: 'type', text: 'hello' },
    ]
    const { first, second, execute } = await runLoop('gpt-6.1-sol', {
      type: 'computer_call',
      id: 'cu_2',
      call_id: 'call_batch',
      status: 'completed',
      actions,
      pending_safety_checks: [safetyCheck],
    })

    expect(first.tools).toEqual([{ type: 'computer' }])
    expect(execute.mock.calls[0]?.[0]).toEqual({
      actions,
      pending_safety_checks: [safetyCheck],
    })
    expect(second.input).toContainEqual({
      type: 'computer_call_output',
      call_id: 'call_batch',
      output: screenshotOutput,
      acknowledged_safety_checks: [safetyCheck],
    })
  })

  it('keeps safety checks that do not parse on the tool input', async () => {
    const action = { type: 'click', button: 'left', x: 10, y: 20 }
    const badChecks = [{ code: 'x' }]
    const { second, execute } = await runLoop('gpt-6.1-sol', {
      type: 'computer_call',
      id: 'cu_bad',
      call_id: 'call_bad',
      status: 'completed',
      action,
      pending_safety_checks: badChecks,
    })

    expect(execute.mock.calls[0]?.[0]).toEqual({
      action,
      pending_safety_checks: badChecks,
    })
    expect(second.input).toContainEqual({
      type: 'computer_call_output',
      call_id: 'call_bad',
      output: screenshotOutput,
    })
    expect(JSON.stringify(second.input)).not.toContain(
      'acknowledged_safety_checks',
    )
  })
})

class TestChatCompletionsAdapter extends OpenAIBaseChatCompletionsTextAdapter<string> {}

describe('portable computer tool on the Chat Completions API', () => {
  it('fails before any request', async () => {
    const create = vi.fn()
    const client = {
      chat: { completions: { create } },
    } as unknown as OpenAI
    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      threadId: 'thread-1',
      adapter: new TestChatCompletionsAdapter('gpt-6.1-sol', 'openai', client),
      messages: [{ role: 'user', content: 'Click the button.' }],
      tools: [genericComputerTool()],
    })) {
      chunks.push(chunk)
    }

    expect(create).not.toHaveBeenCalled()
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'RUN_ERROR',
        message:
          'Computer use needs the Responses API. The Chat Completions API has no computer tool.',
      }),
    )
  })
})
