import { test, expect } from '@playwright/test'
import {
  EventType,
  INTERRUPT_PAYLOAD_METADATA_KEY,
  chat,
  genericInterruptContinuationFromDescriptor,
  wrapGenericInterruptContinuation,
} from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createComputerUse } from '@tanstack/ai-computer-use'
import { createPlaywrightComputerDriver } from '@tanstack/ai-computer-playwright'
import { createOpenaiChat } from '@tanstack/ai-openai'
import type { Locator, Page } from '@playwright/test'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'

/**
 * Computer use from end to end. A real Playwright page is the computer.
 * `createComputerUse` with the Playwright driver runs the actions on it.
 *
 * `chat()` runs in the spec process. A mock `fetch` sends the model streams
 * and keeps each request body. No app server and no API key are used.
 */

const PAGE_HTML = `
  <button id="go" onclick="document.getElementById('status').textContent = 'clicked'">Go</button>
  <p id="status">idle</p>
  <input id="name" />
`

const USER_MESSAGE: ModelMessage = { role: 'user', content: 'Fill the form.' }

const SAFETY_CHECK = {
  id: 'sc_e2e',
  code: 'malicious_instructions',
  message: 'The page asks the model to do something else.',
}

/** A mock `fetch` that sends one stream per request, in order. */
function mockModel(streams: Array<() => ReadableStream<Uint8Array>>) {
  const bodies: Array<unknown> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    bodies.push(JSON.parse(await request.text()))
    const stream = streams[bodies.length - 1]
    if (!stream)
      throw new Error(`No model response for request ${bodies.length}`)
    return new Response(stream(), {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  return { fetch, bodies }
}

function sse(lines: Array<string>) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
}

/** An OpenAI Responses stream that completes with `output`. */
function openaiStream(id: string, output: Array<unknown>) {
  const events = [
    {
      type: 'response.created',
      response: { id, object: 'response', status: 'in_progress', output: [] },
    },
    {
      type: 'response.completed',
      response: {
        id,
        object: 'response',
        status: 'completed',
        output,
        usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 },
      },
    },
  ]
  return () =>
    sse([
      ...events.map((event) => `data: ${JSON.stringify(event)}\n\n`),
      'data: [DONE]\n\n',
    ])
}

const OPENAI_ANSWER = {
  type: 'message',
  id: 'msg_cu_e2e',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
}

/** An Anthropic Messages stream. */
function anthropicStream(events: Array<{ type: string }>) {
  return () =>
    sse(
      events.map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      ),
    )
}

const ANTHROPIC_START = {
  type: 'message_start',
  message: {
    id: 'msg_cu_e2e',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-opus-5-5',
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 0 },
  },
}

function anthropicEnd(stopReason: string) {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 1 },
    },
    { type: 'message_stop' },
  ]
}

/** The blocks of one toolset call of the `computer` toolset. */
function toolsetCall(index: number, id: string, name: string, input: unknown) {
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
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) },
    },
    { type: 'content_block_stop', index },
  ]
}

async function openForm(page: Page) {
  await page.setContent(PAGE_HTML)
  return {
    button: await centerOf(page.locator('#go')),
    input: await centerOf(page.locator('#name')),
  }
}

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The element has no bounding box.')
  return {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  }
}

function computerUseFor(page: Page) {
  return createComputerUse({
    driver: createPlaywrightComputerDriver({ page }),
    screenshotDelay: 0,
  })
}

async function drain(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

/** The assistant message with the tool calls of a paused run. */
function assistantFromChunks(chunks: Array<StreamChunk>): ModelMessage {
  const toolCalls = chunks.flatMap((chunk) => {
    if (chunk.type !== EventType.TOOL_CALL_START) return []
    const end = chunks.find(
      (item) =>
        item.type === EventType.TOOL_CALL_END &&
        item.toolCallId === chunk.toolCallId,
    )
    const input = end?.type === EventType.TOOL_CALL_END ? end.input : {}
    return [
      {
        id: chunk.toolCallId,
        type: 'function' as const,
        function: {
          name: chunk.toolCallName,
          arguments: JSON.stringify(input),
        },
        metadata: chunk.metadata,
      },
    ]
  })
  return { role: 'assistant', content: null, toolCalls }
}

function interruptOutcome(chunks: Array<StreamChunk>) {
  const finished = chunks.find((chunk) => chunk.type === EventType.RUN_FINISHED)
  const outcome =
    finished?.type === EventType.RUN_FINISHED ? finished.outcome : undefined
  if (outcome?.type !== 'interrupt') {
    throw new Error('The run did not end with an interrupt.')
  }
  return outcome.interrupts
}

test.describe('computer use with a Playwright page', () => {
  test('openai computer tool runs a batch of actions on the page', async ({
    page,
  }) => {
    const { button, input } = await openForm(page)
    const { tool, middleware, interrupt } = computerUseFor(page)
    const model = mockModel([
      openaiStream('resp_cu_1', [
        {
          type: 'computer_call',
          id: 'cu_batch',
          call_id: 'call_cu_batch',
          status: 'completed',
          actions: [
            { type: 'click', button: 'left', ...button },
            { type: 'click', button: 'left', ...input },
            { type: 'type', text: 'hello' },
          ],
          pending_safety_checks: [],
        },
      ]),
      openaiStream('resp_cu_2', [OPENAI_ANSWER]),
    ])

    await drain(
      chat({
        adapter: createOpenaiChat('gpt-6.1-sol', 'sk-e2e-dummy', {
          fetch: model.fetch,
        }),
        messages: [USER_MESSAGE],
        tools: [tool],
        middleware: [middleware],
        interrupts: [interrupt],
      }),
    )

    await expect(page.locator('#status')).toHaveText('clicked')
    await expect(page.locator('#name')).toHaveValue('hello')
    expect(model.bodies).toHaveLength(2)
    expect(model.bodies[0]).toMatchObject({ tools: [{ type: 'computer' }] })
    expect(model.bodies[1]).toMatchObject({
      input: expect.arrayContaining([
        expect.objectContaining({
          type: 'computer_call_output',
          call_id: 'call_cu_batch',
          output: expect.objectContaining({
            type: 'computer_screenshot',
            image_url: expect.stringMatching(/^data:image\/png;base64,./),
          }),
        }),
      ]),
    })
  })

  test('anthropic computer toolset runs each call on the page', async ({
    page,
  }) => {
    const { button, input } = await openForm(page)
    const { tool, middleware, interrupt } = computerUseFor(page)
    const model = mockModel([
      anthropicStream([
        ANTHROPIC_START,
        ...toolsetCall(0, 'toolu_button', 'left_click', {
          coordinate: [button.x, button.y],
        }),
        ...toolsetCall(1, 'toolu_input', 'left_click', {
          coordinate: [input.x, input.y],
        }),
        ...toolsetCall(2, 'toolu_type', 'type', { text: 'hello' }),
        ...anthropicEnd('tool_use'),
      ]),
      anthropicStream([ANTHROPIC_START, ...anthropicEnd('end_turn')]),
    ])

    await drain(
      chat({
        adapter: createAnthropicChat('claude-opus-5-5', 'sk-ant-e2e-dummy', {
          fetch: model.fetch,
        }),
        messages: [USER_MESSAGE],
        tools: [tool],
        middleware: [middleware],
        interrupts: [interrupt],
      }),
    )

    await expect(page.locator('#status')).toHaveText('clicked')
    await expect(page.locator('#name')).toHaveValue('hello')
    expect(model.bodies).toHaveLength(2)
    // The Playwright driver has zoom and no cursor position.
    expect(model.bodies[0]).toMatchObject({
      tools: [
        {
          type: 'computer_toolset_20260801',
          configs: {
            zoom: { enabled: true },
            cursor_position: { enabled: false },
          },
        },
      ],
    })
    const screenshotResult = (toolUseId: string) =>
      expect.objectContaining({
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: expect.arrayContaining([
          expect.objectContaining({
            type: 'image',
            source: expect.objectContaining({
              type: 'base64',
              data: expect.stringMatching(/^./),
            }),
          }),
        ]),
      })
    expect(model.bodies[1]).toMatchObject({
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            screenshotResult('toolu_button'),
            screenshotResult('toolu_input'),
            screenshotResult('toolu_type'),
          ]),
        }),
      ]),
    })
  })

  test('openai safety check pauses the action until a person approves it', async ({
    page,
  }) => {
    const { button } = await openForm(page)
    const { tool, middleware, interrupt } = computerUseFor(page)
    const click = { type: 'click', button: 'left', ...button }
    const model = mockModel([
      openaiStream('resp_cu_1', [
        {
          type: 'computer_call',
          id: 'cu_checked',
          call_id: 'call_cu_checked',
          status: 'completed',
          action: click,
          pending_safety_checks: [SAFETY_CHECK],
        },
      ]),
      openaiStream('resp_cu_2', [OPENAI_ANSWER]),
    ])
    const adapter = createOpenaiChat('gpt-6.1-sol', 'sk-e2e-dummy', {
      fetch: model.fetch,
    })
    const threadId = 'thread-cu-safety'

    // Run 1 ends with the safety-check interrupt. The click waits.
    const first = await drain(
      chat({
        adapter,
        messages: [USER_MESSAGE],
        tools: [tool],
        middleware: [middleware],
        interrupts: [interrupt],
        threadId,
        runId: 'run-cu-safety-1',
      }),
    )
    const [paused, ...others] = interruptOutcome(first)
    expect(others).toEqual([])
    if (!paused) throw new Error('No interrupt in the outcome.')
    expect(paused.metadata?.[INTERRUPT_PAYLOAD_METADATA_KEY]).toEqual({
      checks: [SAFETY_CHECK],
      action: click,
    })
    await expect(page.locator('#status')).toHaveText('idle')
    expect(model.bodies).toHaveLength(1)

    const continuation = genericInterruptContinuationFromDescriptor(paused)
    if (!continuation) throw new Error('The interrupt has no continuation.')
    expect(continuation).toMatchObject({
      definitionId: 'computer-safety-check',
      key: 'call_cu_checked',
    })

    // Run 2 approves the check. The click runs, and the model gets the result.
    await drain(
      chat({
        adapter,
        messages: [USER_MESSAGE, assistantFromChunks(first)],
        tools: [tool],
        middleware: [middleware],
        interrupts: [interrupt],
        threadId,
        runId: 'run-cu-safety-2',
        parentRunId: 'run-cu-safety-1',
        resume: [
          {
            interruptId: paused.id,
            status: 'resolved',
            payload: { approved: true },
            metadata: wrapGenericInterruptContinuation(continuation),
          },
        ],
      }),
    )

    await expect(page.locator('#status')).toHaveText('clicked')
    expect(model.bodies).toHaveLength(2)
    expect(model.bodies[1]).toMatchObject({
      input: expect.arrayContaining([
        expect.objectContaining({
          type: 'computer_call',
          call_id: 'call_cu_checked',
          action: click,
        }),
        expect.objectContaining({
          type: 'computer_call_output',
          call_id: 'call_cu_checked',
          output: expect.objectContaining({
            image_url: expect.stringMatching(/^data:image\/png;base64,./),
          }),
          acknowledged_safety_checks: [SAFETY_CHECK],
        }),
      ]),
    })
  })
})
