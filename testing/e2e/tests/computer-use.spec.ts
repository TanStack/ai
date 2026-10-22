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
import {
  createPlaywrightComputerDriver,
  playwrightComputer,
} from '@tanstack/ai-computer-playwright'
import { localComputer } from '@tanstack/ai-computer-local'
import { createOpenaiChat } from '@tanstack/ai-openai'
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'
import type { ModelMessage, StreamChunk } from '@tanstack/ai'
import type { RobotLike } from '@tanstack/ai-computer-local'

/**
 * Computer use from end to end. A real Playwright page is the computer.
 * `createComputerUse` with the Playwright driver runs the actions on it.
 * `playwrightComputer` makes one page for each thread from the `browser`
 * fixture. `localComputer` runs on a fake robot, because CI has no desktop.
 *
 * `chat()` runs in the spec process. A mock `fetch` sends the model streams
 * and keeps each request body. No app server and no API key are used.
 */

const PAGE_HTML = `
  <button id="go" onclick="document.getElementById('status').textContent = 'clicked'">Go</button>
  <p id="status">idle</p>
  <input id="name" />
`

const START_URL = 'https://computer.test/start'
const FORM_URL = 'https://computer.test/form'

const USER_MESSAGE: ModelMessage = { role: 'user', content: 'Fill the form.' }

const SAFETY_CHECK = {
  id: 'sc_e2e',
  code: 'malicious_instructions',
  message: 'The page asks the model to do something else.',
}

/** The `navigate` function tool in an OpenAI request body. */
const OPENAI_NAVIGATE_TOOL = { type: 'function', name: 'navigate' }

type MockModel = ReturnType<typeof mockModel>
type ComputerUse = ReturnType<typeof createComputerUse>

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

/** An OpenAI `computer_call` item with one action and no safety checks. */
function computerCall(
  name: string,
  action: { type: string; [field: string]: unknown },
) {
  return {
    type: 'computer_call',
    id: `cu_${name}`,
    call_id: `call_cu_${name}`,
    status: 'completed',
    action,
    pending_safety_checks: [],
  }
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

/**
 * Computer use with `playwrightComputer` on the `browser` fixture. Each new
 * context serves `PAGE_HTML` for every `https://computer.test` URL. The
 * contexts stay in `contexts` in the order the threads open them.
 */
function routedComputerUse(browser: Browser) {
  const contexts: Array<BrowserContext> = []
  const computerUse = createComputerUse({
    driver: playwrightComputer({
      startUrl: START_URL,
      browser: {
        async newContext(options) {
          const context = await browser.newContext(options)
          await context.route('https://computer.test/**', (route) =>
            route.fulfill({ contentType: 'text/html', body: PAGE_HTML }),
          )
          contexts.push(context)
          return context
        },
        close: () => browser.close(),
      },
    }),
    screenshotDelay: 0,
  })
  return { computerUse, contexts }
}

/** The one page that the factory opens in a context. */
function pageOf(context: BrowserContext) {
  const [page] = context.pages()
  if (!page) throw new Error('The context has no page.')
  return page
}

function openaiAdapter(model: MockModel) {
  return createOpenaiChat('gpt-6.1-sol', 'sk-e2e-dummy', {
    fetch: model.fetch,
  })
}

/** Run one OpenAI chat with computer use in a thread, to the end. */
function runOpenai(
  computerUse: ComputerUse,
  model: MockModel,
  threadId: string,
) {
  return drain(
    chat({
      adapter: openaiAdapter(model),
      messages: [USER_MESSAGE],
      threadId,
      tools: computerUse.tools,
      middleware: [computerUse.middleware],
      interrupts: [computerUse.interrupt],
    }),
  )
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
    const computerUse = computerUseFor(page)
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

    await runOpenai(computerUse, model, 'thread-cu-batch')

    await expect(page.locator('#status')).toHaveText('clicked')
    await expect(page.locator('#name')).toHaveValue('hello')
    expect(model.bodies).toHaveLength(2)
    // The Playwright driver can navigate, so the `navigate` tool goes too.
    expect(model.bodies[0]).toMatchObject({
      tools: [{ type: 'computer' }, OPENAI_NAVIGATE_TOOL],
    })
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
    const computerUse = computerUseFor(page)
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
        threadId: 'thread-cu-toolset',
        tools: computerUse.tools,
        middleware: [computerUse.middleware],
        interrupts: [computerUse.interrupt],
      }),
    )

    await expect(page.locator('#status')).toHaveText('clicked')
    await expect(page.locator('#name')).toHaveValue('hello')
    expect(model.bodies).toHaveLength(2)
    // The Playwright driver has zoom and no cursor position. It can
    // navigate, so the `navigate` tool goes too, as a custom tool.
    expect(model.bodies[0]).toMatchObject({
      tools: [
        {
          type: 'computer_toolset_20260801',
          configs: {
            zoom: { enabled: true },
            cursor_position: { enabled: false },
          },
        },
        { type: 'custom', name: 'navigate' },
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
    const computerUse = computerUseFor(page)
    const click = { type: 'click', button: 'left', ...button }
    const model = mockModel([
      openaiStream('resp_cu_1', [
        {
          ...computerCall('checked', click),
          pending_safety_checks: [SAFETY_CHECK],
        },
      ]),
      openaiStream('resp_cu_2', [OPENAI_ANSWER]),
    ])
    const adapter = openaiAdapter(model)
    // `createComputerUse` keeps the approvals per thread. So both runs use
    // the same thread.
    const threadId = 'thread-cu-safety'

    // Run 1 ends with the safety-check interrupt. The click waits.
    const first = await drain(
      chat({
        adapter,
        messages: [USER_MESSAGE],
        tools: computerUse.tools,
        middleware: [computerUse.middleware],
        interrupts: [computerUse.interrupt],
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
        tools: computerUse.tools,
        middleware: [computerUse.middleware],
        interrupts: [computerUse.interrupt],
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

test.describe('computer use with playwrightComputer', () => {
  test('playwrightComputer navigates, then clicks', async ({
    browser,
    page,
  }) => {
    // The fixture page has the same HTML and width as the factory pages.
    // So the button has the same center there.
    const { button } = await openForm(page)
    const { computerUse, contexts } = routedComputerUse(browser)
    const model = mockModel([
      openaiStream('resp_cu_1', [
        {
          type: 'function_call',
          id: 'fc_cu_navigate',
          call_id: 'call_cu_navigate',
          name: 'navigate',
          arguments: JSON.stringify({ url: FORM_URL }),
          status: 'completed',
        },
      ]),
      openaiStream('resp_cu_2', [
        computerCall('click', { type: 'click', button: 'left', ...button }),
      ]),
      openaiStream('resp_cu_3', [OPENAI_ANSWER]),
    ])

    await runOpenai(computerUse, model, 'thread-cu-navigate')

    expect(contexts).toHaveLength(1)
    const [formPage] = contexts.map(pageOf)
    expect(formPage.url()).toBe(FORM_URL)
    await expect(formPage.locator('#status')).toHaveText('clicked')
    expect(model.bodies).toHaveLength(3)
    expect(model.bodies[0]).toMatchObject({
      tools: [{ type: 'computer' }, OPENAI_NAVIGATE_TOOL],
    })
    expect(model.bodies[1]).toMatchObject({
      input: expect.arrayContaining([
        expect.objectContaining({
          type: 'function_call_output',
          call_id: 'call_cu_navigate',
          output: [
            expect.objectContaining({
              type: 'input_image',
              image_url: expect.stringMatching(/^data:image\/png;base64,./),
            }),
          ],
        }),
      ]),
    })

    await computerUse.close()
  })

  test('two threads get two pages', async ({ browser, page }) => {
    const { button } = await openForm(page)
    const { computerUse, contexts } = routedComputerUse(browser)
    // Thread A clicks Go. Thread B only takes a screenshot.
    const clickModel = mockModel([
      openaiStream('resp_cu_a1', [
        computerCall('click', { type: 'click', button: 'left', ...button }),
      ]),
      openaiStream('resp_cu_a2', [OPENAI_ANSWER]),
    ])
    const lookModel = mockModel([
      openaiStream('resp_cu_b1', [
        computerCall('look', { type: 'screenshot' }),
      ]),
      openaiStream('resp_cu_b2', [OPENAI_ANSWER]),
    ])

    await runOpenai(computerUse, clickModel, 'a')
    await runOpenai(computerUse, lookModel, 'b')

    expect(contexts).toHaveLength(2)
    const [pageA, pageB] = contexts.map(pageOf)
    await expect(pageA.locator('#status')).toHaveText('clicked')
    await expect(pageB.locator('#status')).toHaveText('idle')

    // `close('a')` closes the context of thread A. Thread B keeps its page.
    await computerUse.close('a')
    expect(pageA.isClosed()).toBe(true)
    expect(pageB.isClosed()).toBe(false)

    await computerUse.close()
    expect(pageB.isClosed()).toBe(true)
  })
})

/** A fake robot on a 2560 x 1600 screen. Each call adds one line to `calls`. */
function fakeRobot() {
  const screen = { width: 2560, height: 1600 }
  const calls: Array<string> = []
  const record =
    (name: string) =>
    (...args: Array<string | number | boolean | undefined>) => {
      calls.push([name, ...args].join(' ').trim())
    }
  const robot: RobotLike = {
    getScreenSize: () => screen,
    getMousePos: () => ({ x: 0, y: 0 }),
    moveMouse: record('moveMouse'),
    mouseClick: record('mouseClick'),
    mouseToggle: record('mouseToggle'),
    scrollMouse: record('scrollMouse'),
    keyToggle: record('keyToggle'),
    typeString: record('typeString'),
    screen: {
      capture: () => ({
        ...screen,
        byteWidth: screen.width * 4,
        bytesPerPixel: 4,
        image: new Uint8Array(screen.width * screen.height * 4),
      }),
    },
  }
  return { robot, calls }
}

/** The size of the first PNG screenshot in a request body. */
function screenshotSize(body: unknown) {
  const match = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(
    JSON.stringify(body),
  )
  if (!match?.[1]) throw new Error('The request has no PNG screenshot.')
  const png = Buffer.from(match[1], 'base64')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

test.describe('computer use with localComputer', () => {
  test('localComputer clicks on the screen and sends a display-size screenshot', async () => {
    const { robot, calls } = fakeRobot()
    const computerUse = createComputerUse({
      driver: localComputer({ robot }),
      screenshotDelay: 0,
    })
    const model = mockModel([
      openaiStream('resp_cu_1', [
        {
          type: 'computer_call',
          id: 'cu_local',
          call_id: 'call_cu_local',
          status: 'completed',
          actions: [
            { type: 'click', button: 'left', x: 640, y: 400 },
            { type: 'type', text: 'hello' },
          ],
          pending_safety_checks: [],
        },
      ]),
      openaiStream('resp_cu_2', [OPENAI_ANSWER]),
    ])

    await runOpenai(computerUse, model, 'thread-cu-local')

    // The 2560 x 1600 screen fits in 1280 x 800, so each point doubles.
    expect(calls).toEqual([
      'moveMouse 1280 800',
      'mouseClick left',
      'typeString hello',
    ])
    expect(model.bodies).toHaveLength(2)
    // A desktop has no address, so the `navigate` tool does not go.
    expect(model.bodies[0]).toMatchObject({ tools: [{ type: 'computer' }] })
    expect(screenshotSize(model.bodies[1])).toEqual({
      width: 1280,
      height: 800,
    })
  })
})
