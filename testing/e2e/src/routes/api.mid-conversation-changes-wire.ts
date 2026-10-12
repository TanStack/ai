import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createOpenaiChat } from '@tanstack/ai-openai'
import { z } from 'zod'
import type { ChatMiddleware } from '@tanstack/ai'

const OPENAI_KEY = 'sk-e2e-test-dummy-key'
const ANTHROPIC_KEY = 'sk-ant-e2e-test-dummy-key'

type SseEvent = Record<string, unknown> & { type: string }

/** Both SDKs read `event:` + `data:` frames. */
function sse(events: Array<SseEvent>): string {
  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')
}

const weatherArgs = JSON.stringify({ city: 'Paris' })

const gptCall = {
  id: 'call_weather',
  call_id: 'call_weather',
  type: 'function_call',
  name: 'get_weather',
  arguments: weatherArgs,
  status: 'completed',
}

/** GPT calls get_weather, as OpenAI Responses streams it. */
const gptToolCall = sse([
  {
    type: 'response.created',
    response: {
      id: 'resp_tool',
      object: 'response',
      model: 'gpt-6-astra',
      status: 'in_progress',
      output: [],
    },
  },
  {
    type: 'response.output_item.added',
    response_id: 'resp_tool',
    output_index: 0,
    item: { ...gptCall, arguments: '', status: 'in_progress' },
  },
  {
    type: 'response.function_call_arguments.delta',
    response_id: 'resp_tool',
    item_id: 'call_weather',
    output_index: 0,
    delta: weatherArgs,
  },
  {
    type: 'response.function_call_arguments.done',
    response_id: 'resp_tool',
    item_id: 'call_weather',
    output_index: 0,
    arguments: weatherArgs,
  },
  {
    type: 'response.output_item.done',
    response_id: 'resp_tool',
    output_index: 0,
    item: gptCall,
  },
  {
    type: 'response.completed',
    response: {
      id: 'resp_tool',
      object: 'response',
      model: 'gpt-6-astra',
      status: 'completed',
      output: [gptCall],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
  },
])

/** GPT answers with text. */
const gptText = sse([
  {
    type: 'response.created',
    response: {
      id: 'resp_text',
      object: 'response',
      model: 'gpt-6-astra',
      status: 'in_progress',
      output: [],
    },
  },
  {
    type: 'response.output_text.delta',
    response_id: 'resp_text',
    item_id: 'msg_text',
    output_index: 0,
    content_index: 0,
    delta: 'Sunny in Paris.',
  },
  {
    type: 'response.completed',
    response: {
      id: 'resp_text',
      object: 'response',
      model: 'gpt-6-astra',
      status: 'completed',
      output: [
        {
          id: 'msg_text',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Sunny in Paris.' }],
        },
      ],
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
    },
  },
])

function claudeStart(id: string): SseEvent {
  return {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-opus-5-5',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  }
}

function claudeEnd(stopReason: string): Array<SseEvent> {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 10 },
    },
    { type: 'message_stop' },
  ]
}

/** Claude calls get_weather, as Anthropic Messages streams it. */
const claudeToolCall = sse([
  claudeStart('msg_tool'),
  {
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'tool_use',
      id: 'toolu_weather',
      name: 'get_weather',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'input_json_delta', partial_json: weatherArgs },
  },
  { type: 'content_block_stop', index: 0 },
  ...claudeEnd('tool_use'),
])

/** Claude answers with text. */
const claudeText = sse([
  claudeStart('msg_text'),
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Sunny in Paris.' },
  },
  { type: 'content_block_stop', index: 0 },
  ...claudeEnd('end_turn'),
])

type Captured = { body: Record<string, unknown>; beta: string | null }

/** Records each request. Answers the first with `toolCall`, the rest with `text`. */
function capture(toolCall: string, text: string) {
  const requests: Array<Captured> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    requests.push({
      body: JSON.parse(await request.text()),
      beta: request.headers.get('anthropic-beta'),
    })
    return new Response(requests.length === 1 ? toolCall : text, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
  return { requests, fetchImpl }
}

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => ({ city, temperature: 21 }))

const getForecast = toolDefinition({
  name: 'get_forecast',
  description: 'Get the forecast for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => ({ city, tomorrow: 'sunny' }))

/** Adds get_forecast before the second model call, after the first tool batch. */
const addForecast: ChatMiddleware = {
  name: 'add-forecast',
  onConfig: (ctx, config) => {
    if (ctx.phase !== 'beforeModel' || ctx.iteration === 0) return undefined
    if (config.tools.some((tool) => tool.name === 'get_forecast')) {
      return undefined
    }
    return { tools: [...config.tools, getForecast] }
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function list(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : []
}

function names(value: unknown): Array<string> {
  return list(value).flatMap((tool) =>
    isRecord(tool) && typeof tool.name === 'string' ? [tool.name] : [],
  )
}

/** The RUN_ERROR chunks of a run, so a broken stream shows in the spec. */
async function errorsOf(stream: AsyncIterable<{ type: string }>) {
  const errors: Array<string> = []
  for await (const chunk of stream) {
    if (chunk.type === 'RUN_ERROR') errors.push(JSON.stringify(chunk))
  }
  return errors
}

/** What the spec checks in the two requests of one case. */
function summarize(
  name: string,
  errors: Array<string>,
  requests: Array<Captured>,
) {
  const [first, second] = requests
  const last = list(second?.body.input ?? second?.body.messages).at(-1)
  return {
    name,
    errors,
    requestCount: requests.length,
    firstTools: names(first?.body.tools),
    secondTools: names(second?.body.tools),
    // OpenAI: the tools of `additional_tools` input items.
    additionalTools: list(second?.body.input).flatMap((item) =>
      isRecord(item) && item.type === 'additional_tools'
        ? names(item.tools)
        : [],
    ),
    // Anthropic: the tools of `tool_addition` blocks in `system` messages.
    toolAdditions: list(second?.body.messages)
      .flatMap((message) =>
        isRecord(message) && message.role === 'system'
          ? list(message.content)
          : [],
      )
      .flatMap((block) =>
        isRecord(block) && block.type === 'tool_addition'
          ? names([block.tool])
          : [],
      ),
    deferred: list(second?.body.tools).flatMap((tool) =>
      isRecord(tool) && tool.defer_loading === true ? names([tool]) : [],
    ),
    // The tools with a set prompt-cache marker, per request. Custom tools
    // always send `cache_control: null`, so only an object counts.
    toolCacheMarks: requests.map((request) =>
      list(request.body.tools).flatMap((tool) =>
        isRecord(tool) && isRecord(tool.cache_control) ? names([tool]) : [],
      ),
    ),
    betas: requests.map((request) =>
      request.beta ? request.beta.split(',').map((beta) => beta.trim()) : [],
    ),
    lastItem: isRecord(last) ? String(last.type ?? last.role) : null,
  }
}

/** A custom `fetch` turns the channels off, so the GPT cases turn them on. */
async function gpt(model: 'gpt-6-astra' | 'gpt-6.1-sol') {
  const wire = capture(gptToolCall, gptText)
  const errors = await errorsOf(
    chat({
      adapter: createOpenaiChat(model, OPENAI_KEY, {
        fetch: wire.fetchImpl,
        midConversationChannels: true,
      }),
      messages: [
        { role: 'user', content: '[mid-conversation] weather in Paris' },
      ],
      tools: [getWeather],
      middleware: [addForecast],
    }),
  )
  return summarize(model, errors, wire.requests)
}

async function claude(
  name: string,
  model: 'claude-opus-5-5' | 'claude-sonnet-5-5',
  options: { midConversationChannels?: boolean },
) {
  const wire = capture(claudeToolCall, claudeText)
  const errors = await errorsOf(
    chat({
      adapter: createAnthropicChat(model, ANTHROPIC_KEY, {
        fetch: wire.fetchImpl,
        ...options,
      }),
      messages: [
        { role: 'user', content: '[mid-conversation] weather in Paris' },
      ],
      tools: [getWeather],
      middleware: [addForecast],
    }),
  )
  return summarize(name, errors, wire.requests)
}

/**
 * A middleware adds `get_forecast` after the first tool batch. Runs that with
 * real adapters and a capturing `fetch` on two models in the map
 * (`gpt-6-astra`, `claude-opus-5-5`) and two outside it (`gpt-6.1-sol`,
 * `claude-sonnet-5-5`), all with `midConversationChannels: true`, and on
 * `claude-opus-5-5` with no option (the gateway case). Returns what the two
 * requests of each case held.
 */
export const Route = createFileRoute('/api/mid-conversation-changes-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          return Response.json({
            ok: true,
            cases: [
              await gpt('gpt-6-astra'),
              await gpt('gpt-6.1-sol'),
              await claude('claude-opus-5-5', 'claude-opus-5-5', {
                midConversationChannels: true,
              }),
              await claude('claude-sonnet-5-5', 'claude-sonnet-5-5', {
                midConversationChannels: true,
              }),
              await claude('claude-opus-5-5 gateway', 'claude-opus-5-5', {}),
            ],
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
