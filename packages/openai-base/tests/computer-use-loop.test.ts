import { describe, expect, it, vi } from 'vitest'
import { chat } from '@tanstack/ai'
import { OpenAIBaseResponsesTextAdapter } from '../src/adapters/responses-text'
import { computerUseTool } from '../src/tools/computer-use-tool'
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
      response: {
        id: 'resp_1',
        model: 'computer-use-preview',
        status: 'in_progress',
      },
    },
    {
      type: 'response.completed',
      response: {
        id: 'resp_1',
        model: 'computer-use-preview',
        status: 'completed',
        output,
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      },
    },
  ]
}

const clickCall = {
  type: 'computer_call',
  id: 'cu_1',
  call_id: 'call_cu',
  status: 'completed',
  action: { type: 'click', button: 'left', x: 10, y: 20 },
  pending_safety_checks: [safetyCheck],
}

const answer = {
  type: 'message',
  id: 'msg_1',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
}

// The OpenAI adapter sends provider tools in their native shape.
class TestAdapter extends OpenAIBaseResponsesTextAdapter<string> {
  protected override convertTools(tools: Array<Tool>) {
    return convertToolsToProviderFormat(tools)
  }
}

class FileAdapter extends TestAdapter {
  override readonly supportsFileSources = true
}

const previewTool = computerUseTool({
  type: 'computer_use_preview',
  display_width: 1024,
  display_height: 768,
  environment: 'browser',
})

const screenshot = [
  {
    type: 'image',
    source: { type: 'data', value: 'iVBORw0KGgo=', mimeType: 'image/png' },
  },
]

async function runLoop(
  execute: (input: unknown) => Promise<unknown>,
  {
    computer = previewTool,
    call = clickCall,
  }: { computer?: Tool; call?: Record<string, unknown> } = {},
) {
  const create = vi
    .fn()
    .mockResolvedValueOnce(completed([call]))
    .mockResolvedValueOnce(completed([answer]))
  const client = {
    responses: { create: (params: unknown) => create(params) },
  } as unknown as OpenAI
  const adapter = new TestAdapter('computer-use-preview', 'openai', client)
  const tool = { ...computer, execute: vi.fn(execute) }
  const chunks: Array<StreamChunk> = []
  for await (const chunk of chat({
    adapter,
    messages: [{ role: 'user', content: 'Click the button.' }],
    tools: [tool],
  })) {
    chunks.push(chunk)
  }
  return { create, execute: tool.execute, chunks }
}

describe('computer use loop', () => {
  it('runs the computer call and sends the screenshot back', async () => {
    const { create, execute } = await runLoop(async () => screenshot)

    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.calls[0]?.[0]).toEqual({
      action: { type: 'click', button: 'left', x: 10, y: 20 },
      pending_safety_checks: [safetyCheck],
    })
    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]?.[0].input).toEqual(
      expect.arrayContaining([
        {
          type: 'computer_call',
          id: 'cu_1',
          call_id: 'call_cu',
          status: 'completed',
          action: { type: 'click', button: 'left', x: 10, y: 20 },
          pending_safety_checks: [safetyCheck],
        },
        {
          type: 'computer_call_output',
          call_id: 'call_cu',
          output: {
            type: 'computer_screenshot',
            image_url: 'data:image/png;base64,iVBORw0KGgo=',
            detail: 'original',
          },
          acknowledged_safety_checks: [safetyCheck],
        },
      ]),
    )
  })

  it('runs the batched actions of the computer tool', async () => {
    const actions = [
      { type: 'click', button: 'left', x: 10, y: 20 },
      { type: 'type', text: 'hello' },
    ]
    const { create, execute } = await runLoop(async () => screenshot, {
      computer: computerUseTool({ type: 'computer' }),
      call: {
        type: 'computer_call',
        id: 'cu_2',
        call_id: 'call_batch',
        status: 'completed',
        actions,
        pending_safety_checks: [],
      },
    })

    expect(execute.mock.calls[0]?.[0]).toEqual({
      actions,
      pending_safety_checks: [],
    })
    const [first, second] = create.mock.calls.map(([params]) => params)
    expect(first.tools).toEqual([{ type: 'computer' }])
    expect(second.input).toEqual(
      expect.arrayContaining([
        {
          type: 'computer_call',
          id: 'cu_2',
          call_id: 'call_batch',
          status: 'completed',
          actions,
          pending_safety_checks: [],
        },
        {
          type: 'computer_call_output',
          call_id: 'call_batch',
          output: {
            type: 'computer_screenshot',
            image_url: 'data:image/png;base64,iVBORw0KGgo=',
            detail: 'original',
          },
        },
      ]),
    )
  })

  it('reads no screenshot from the result of another app tool', async () => {
    const create = vi.fn().mockResolvedValueOnce(completed([answer]))
    const client = {
      responses: { create: (params: unknown) => create(params) },
    } as unknown as OpenAI
    // OpenAI takes file sources, but not a file from another provider, so a
    // screenshot read of this result would throw.
    const adapter = new FileAdapter('gpt-5.5', 'openai', client)
    for await (const _ of chat({
      adapter,
      messages: [
        {
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'call_sh',
              type: 'function',
              function: {
                name: 'local_shell',
                arguments: JSON.stringify({ command: ['ls'] }),
              },
              metadata: { openaiUserTool: 'local_shell', itemId: 'ls_1' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'call_sh',
          content: [
            {
              type: 'image',
              source: { type: 'file', value: 'file_1', provider: 'gemini' },
            },
          ],
        },
      ],
    })) {
      // Drain the stream.
    }

    expect(create.mock.calls[0]?.[0].input).toContainEqual(
      expect.objectContaining({ type: 'local_shell_call_output' }),
    )
  })

  it('does not acknowledge the safety checks of a failed call', async () => {
    const { create } = await runLoop(async () => {
      throw new Error('A person did not allow the click.')
    })

    const input: Array<Record<string, unknown>> =
      create.mock.calls[1]?.[0].input
    const output = input.find((item) => item.type === 'computer_call_output')
    expect(output).toEqual({
      type: 'computer_call_output',
      call_id: 'call_cu',
      output: { type: 'computer_screenshot' },
    })
  })
})
