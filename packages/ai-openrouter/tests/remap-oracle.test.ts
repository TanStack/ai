import { describe, expect, it } from 'vitest'
import {
  ChatRequest$outboundSchema,
  ChatResult$inboundSchema,
  ChatStreamChunk$inboundSchema,
  OpenResponsesResult$inboundSchema,
  ResponsesRequest$outboundSchema,
  StreamEvents$inboundSchema,
  VideoGenerationRequest$outboundSchema,
  VideoGenerationResponse$inboundSchema,
} from '@openrouter/sdk/models'
import {
  CreateRerankRequestBody$outboundSchema,
  CreateRerankResponse$inboundSchema,
} from '@openrouter/sdk/models/operations'
import { remap } from '../src/client/remap'
import * as chat from '../src/client/tables/chat'
import * as responses from '../src/client/tables/responses'
import * as rerank from '../src/client/tables/rerank'
import * as video from '../src/client/tables/video'
import type { RemapNode, RemapObjects } from '../src/client/remap'

// The SDK zod schemas are the oracle: our table-driven `remap` must give the
// same output for the same input.
interface Oracle {
  parse: (value: unknown) => unknown
}

function expectSame(
  oracle: Oracle,
  [objects, node]: [RemapObjects, RemapNode],
  fixture: unknown,
) {
  expect(remap(fixture, node, objects)).toEqual(oracle.parse(fixture))
}

const chatRequest = {
  model: 'openai/gpt-5.5',
  models: ['openai/gpt-5.5', 'anthropic/claude-opus-4.7'],
  messages: [
    { role: 'system', content: 'Be brief.' },
    { role: 'developer', content: [{ type: 'text', text: 'Rules' }] },
    {
      role: 'user',
      name: 'ann',
      content: [
        {
          type: 'text',
          text: 'Look',
          cacheControl: { type: 'ephemeral', ttl: '1h' },
        },
        {
          type: 'image_url',
          imageUrl: { url: 'https://example.com/a.png', detail: 'high' },
        },
        { type: 'input_audio', inputAudio: { data: 'AAA', format: 'wav' } },
        {
          type: 'file',
          file: {
            fileData: 'data:application/pdf;base64,AA',
            filename: 'a.pdf',
          },
        },
        { type: 'video_url', videoUrl: { url: 'https://example.com/v.mp4' } },
      ],
    },
    {
      role: 'assistant',
      content: null,
      reasoning: 'thinking',
      reasoningDetails: [
        { type: 'reasoning.text', text: 'step', signature: 'sig', index: 0 },
        { type: 'reasoning.encrypted', data: 'enc', id: 'r1' },
        { type: 'reasoning.summary', summary: 'sum', format: 'unknown' },
      ],
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'lookup', arguments: '{"q":1}' },
        },
      ],
    },
    { role: 'tool', toolCallId: 'call_1', content: '{"ok":true}' },
    { role: 'user', content: 'again', unknownKey: 'dropped' },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'lookup',
        description: 'Look up',
        parameters: {
          type: 'object',
          properties: { userId: { type: 'string' } },
          additionalProperties: false,
        },
        strict: true,
      },
      cacheControl: { type: 'ephemeral' },
    },
    {
      type: 'openrouter:web_search',
      parameters: {
        maxResults: 3,
        searchContextSize: 'high',
        allowedDomains: ['example.com'],
        userLocation: { type: 'approximate', city: 'Berlin' },
      },
    },
    { type: 'openrouter:web_fetch', parameters: { maxUses: 2 } },
    { type: 'openrouter:datetime', parameters: { timezone: 'UTC' } },
  ],
  toolChoice: { type: 'function', function: { name: 'lookup' } },
  responseFormat: {
    type: 'json_schema',
    jsonSchema: {
      name: 'out',
      strict: true,
      schema: { type: 'object', properties: { camelKey: { type: 'string' } } },
    },
  },
  provider: {
    allowFallbacks: false,
    dataCollection: 'deny',
    requireParameters: true,
    order: ['openai'],
    maxPrice: { prompt: '1', completion: '2' },
    sort: { by: 'price', partition: 'none' },
    preferredMaxLatency: { p50: 1, p90: 2 },
    zdr: true,
  },
  plugins: [
    { id: 'web', maxResults: 2, searchPrompt: 'find', engine: 'exa' },
    { id: 'file-parser', pdf: { engine: 'pdf-text' } },
    { id: 'response-healing' },
  ],
  reasoning: { effort: 'high', summary: 'auto' },
  streamOptions: { includeUsage: true },
  stream: true,
  maxCompletionTokens: 100,
  maxTokens: 50,
  temperature: 0.2,
  topP: 0.9,
  topK: 4,
  frequencyPenalty: 0.1,
  presencePenalty: 0.2,
  repetitionPenalty: 1.1,
  seed: 3,
  stop: ['END'],
  logitBias: { '50256': -100 },
  logprobs: true,
  topLogprobs: 2,
  parallelToolCalls: false,
  imageConfig: { aspect_ratio: '16:9', image_size: '1K' },
  modalities: ['text', 'image'],
  metadata: { camelKey: 'kept' },
  user: 'user-1',
  sessionId: 'session-1',
  cacheControl: { type: 'ephemeral' },
  trace: { traceId: 't1', spanName: 's', additionalProperties: { extra: 1 } },
  debug: { echoUpstreamBody: true },
  notAField: 'dropped',
}

const responsesRequest = {
  model: 'openai/gpt-5.5',
  instructions: 'Be brief.',
  input: [
    { role: 'user', content: 'Hi' },
    {
      role: 'user',
      type: 'message',
      content: [
        { type: 'input_text', text: 'Look' },
        {
          type: 'input_image',
          imageUrl: 'https://example.com/a.png',
          detail: 'auto',
        },
        {
          type: 'input_file',
          fileData: 'data:application/pdf;base64,AA',
          filename: 'a.pdf',
        },
      ],
    },
    {
      type: 'function_call',
      callId: 'call_1',
      name: 'lookup',
      arguments: '{}',
      id: 'fc_1',
      status: 'completed',
    },
    { type: 'function_call_output', callId: 'call_1', output: '{"ok":true}' },
    {
      type: 'reasoning',
      id: 'rs_1',
      summary: [{ type: 'summary_text', text: 'sum' }],
      encryptedContent: 'enc',
    },
    {
      type: 'message',
      role: 'assistant',
      id: 'msg_1',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Earlier', annotations: [] }],
    },
  ],
  tools: [
    {
      type: 'function',
      name: 'lookup',
      description: 'Look up',
      parameters: { type: 'object', properties: {} },
      strict: true,
    },
    { type: 'web_search_preview', searchContextSize: 'low' },
  ],
  toolChoice: { type: 'function', name: 'lookup' },
  text: {
    format: {
      type: 'json_schema',
      name: 'out',
      schema: { type: 'object' },
      strict: true,
    },
    verbosity: 'low',
  },
  reasoning: { effort: 'medium', summary: 'auto' },
  provider: { dataCollection: 'allow', ignore: ['azure'] },
  plugins: [{ id: 'web', maxResults: 1 }],
  maxOutputTokens: 100,
  temperature: 0.5,
  topP: 1,
  parallelToolCalls: true,
  previousResponseId: 'resp_0',
  promptCacheKey: 'key',
  metadata: { a: 'b' },
  stream: false,
  store: false,
  user: 'u',
}

const chatResultWire = {
  id: 'gen-1',
  object: 'chat.completion',
  created: 1,
  model: 'openai/gpt-5.5',
  system_fingerprint: null,
  service_tier: 'default',
  provider: 'OpenAI',
  choices: [
    {
      index: 0,
      finish_reason: 'tool_calls',
      native_finish_reason: 'tool_calls',
      logprobs: null,
      message: {
        role: 'assistant',
        content: 'Hello',
        refusal: null,
        reasoning: 'thought',
        reasoning_details: [
          {
            type: 'reasoning.text',
            text: 'step',
            format: 'anthropic-claude-v1',
            index: 0,
          },
          { type: 'reasoning.unknown_kind', data: 'x' },
        ],
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":1}' },
          },
        ],
        images: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
        ],
        annotations: [],
      },
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    cost: 0.001,
    is_byok: false,
    prompt_tokens_details: {
      cached_tokens: 4,
      cache_write_tokens: 1,
      audio_tokens: 0,
    },
    completion_tokens_details: { reasoning_tokens: 2, image_tokens: 1 },
    cost_details: {
      upstream_inference_cost: 0.001,
      upstream_inference_prompt_cost: 0.0004,
      upstream_inference_completions_cost: 0.0006,
    },
  },
}

const chatChunksWire = [
  {
    id: 'gen-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'openai/gpt-5.5',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: 'Hel' },
        finish_reason: null,
        native_finish_reason: null,
      },
    ],
  },
  {
    id: 'gen-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'openai/gpt-5.5',
    choices: [
      {
        index: 0,
        delta: {
          reasoning_details: [{ type: 'reasoning.text', text: 'r', index: 0 }],
          tool_calls: [
            {
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup', arguments: '{"q"' },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  },
  {
    id: 'gen-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'openai/gpt-5.5',
    choices: [],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      prompt_tokens_details: { cached_tokens: 4 },
    },
  },
  {
    id: 'gen-1',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'openai/gpt-5.5',
    choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
    error: {
      code: 502,
      message: 'Provider failed',
      metadata: {
        error_type: 'provider_unavailable',
        provider_code: 'x',
        extra: 1,
      },
    },
  },
]

const responseWire = {
  id: 'resp_1',
  object: 'response',
  created_at: 1,
  completed_at: 2,
  model: 'openai/gpt-5.5',
  status: 'completed',
  error: null,
  incomplete_details: null,
  instructions: null,
  metadata: null,
  frequency_penalty: null,
  presence_penalty: null,
  temperature: null,
  top_p: null,
  parallel_tool_calls: true,
  tool_choice: 'auto',
  tools: [
    {
      type: 'function',
      name: 'lookup',
      parameters: { type: 'object' },
      strict: true,
      description: null,
    },
  ],
  output_text: 'Hello',
  output: [
    {
      type: 'reasoning',
      id: 'rs_1',
      summary: [{ type: 'summary_text', text: 'sum' }],
      encrypted_content: 'enc',
    },
    {
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
    },
    {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'lookup',
      arguments: '{}',
      status: 'completed',
    },
    { type: 'brand_new_item', id: 'x_1' },
  ],
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    total_tokens: 15,
    input_tokens_details: { cached_tokens: 3 },
    output_tokens_details: { reasoning_tokens: 1 },
    cost: 0.01,
  },
}

const streamEventsWire = [
  {
    type: 'response.created',
    sequence_number: 0,
    response: { ...responseWire, status: 'in_progress', output: [] },
  },
  {
    type: 'response.output_item.added',
    sequence_number: 1,
    output_index: 0,
    item: {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'lookup',
      arguments: '',
    },
  },
  {
    type: 'response.output_text.delta',
    sequence_number: 2,
    item_id: 'msg_1',
    output_index: 1,
    content_index: 0,
    delta: 'Hel',
    logprobs: [],
  },
  // aimock style: no `logprobs` and no `sequence_number`. The SDK falls back.
  {
    type: 'response.output_text.delta',
    item_id: 'msg_1',
    output_index: 1,
    content_index: 0,
    delta: 'lo',
  },
  {
    type: 'response.function_call_arguments.delta',
    sequence_number: 3,
    item_id: 'fc_1',
    output_index: 0,
    delta: '{}',
  },
  {
    type: 'response.reasoning_summary_text.delta',
    sequence_number: 4,
    item_id: 'rs_1',
    output_index: 0,
    summary_index: 0,
    delta: 'think',
  },
  { type: 'response.completed', sequence_number: 5, response: responseWire },
  {
    type: 'response.failed',
    sequence_number: 6,
    response: {
      ...responseWire,
      status: 'failed',
      error: { code: 'server_error', message: 'boom' },
    },
  },
  {
    type: 'error',
    sequence_number: 7,
    code: 'rate_limit',
    message: 'slow down',
    param: null,
  },
  { type: 'response.some_future_event', sequence_number: 8 },
  'not an object',
]

describe('remap matches the SDK zod schemas', () => {
  it('maps a chat request to the wire body', () => {
    expectSame(
      ChatRequest$outboundSchema,
      [chat.OBJECTS, chat.ChatRequest],
      chatRequest,
    )
  })

  it('fills the chat request defaults', () => {
    expectSame(ChatRequest$outboundSchema, [chat.OBJECTS, chat.ChatRequest], {
      messages: [{ role: 'user', content: 'Hi' }],
    })
  })

  it('maps a responses request to the wire body', () => {
    expectSame(
      ResponsesRequest$outboundSchema,
      [responses.OBJECTS, responses.ResponsesRequest],
      responsesRequest,
    )
  })

  it('maps a rerank request to the wire body', () => {
    expectSame(
      CreateRerankRequestBody$outboundSchema,
      [rerank.OBJECTS, rerank.RerankRequest],
      {
        model: 'cohere/rerank-v3.5',
        query: 'q',
        documents: ['a', { text: 'b' }],
        topN: 1,
        provider: { dataCollection: 'deny', only: ['cohere'] },
      },
    )
  })

  it('maps a video request to the wire body', () => {
    expectSame(
      VideoGenerationRequest$outboundSchema,
      [video.OBJECTS, video.VideoGenerationRequest],
      {
        model: 'google/veo-3.1',
        prompt: 'a cat',
        aspectRatio: '16:9',
        duration: 8,
        resolution: '720p',
        generateAudio: true,
        frameImages: [
          {
            type: 'image_url',
            imageUrl: { url: 'https://example.com/a.png' },
            frameType: 'first_frame',
          },
        ],
        inputReferences: [
          { type: 'image_url', imageUrl: { url: 'https://example.com/b.png' } },
        ],
        provider: { options: { 'google-vertex': { parameters: { seed: 1 } } } },
      },
    )
  })

  it('maps a chat result from the wire', () => {
    expectSame(
      ChatResult$inboundSchema,
      [chat.OBJECTS, chat.ChatResult],
      chatResultWire,
    )
  })

  it.each(chatChunksWire.map((chunk, index) => [index, chunk]))(
    'maps chat stream chunk %i from the wire',
    (_, chunk) => {
      expectSame(
        ChatStreamChunk$inboundSchema,
        [chat.OBJECTS, chat.ChatStreamChunk],
        chunk,
      )
    },
  )

  it('maps a responses result from the wire', () => {
    expectSame(
      OpenResponsesResult$inboundSchema,
      [responses.OBJECTS, responses.OpenResponsesResult],
      responseWire,
    )
  })

  it.each(streamEventsWire.map((event, index) => [index, event]))(
    'maps responses stream event %i from the wire',
    (_, event) => {
      expectSame(
        StreamEvents$inboundSchema,
        [responses.OBJECTS, responses.StreamEvents],
        event,
      )
    },
  )

  it('maps a rerank response from the wire', () => {
    expectSame(
      CreateRerankResponse$inboundSchema,
      [rerank.OBJECTS, rerank.RerankResponse],
      {
        id: 'rr_1',
        model: 'cohere/rerank-v3.5',
        provider: 'Cohere',
        results: [
          { index: 1, relevance_score: 0.9, document: { text: 'b' } },
          { index: 0, relevance_score: 0.1, document: { text: 'a' } },
        ],
        usage: { total_tokens: 3, search_units: 1, cost: 0.001 },
      },
    )
  })

  it('maps a video response from the wire', () => {
    expectSame(
      VideoGenerationResponse$inboundSchema,
      [video.OBJECTS, video.VideoGenerationResponse],
      {
        id: 'job_1',
        polling_url: 'https://openrouter.ai/api/v1/videos/job_1',
        status: 'completed',
        generation_id: 'gen_1',
        unsigned_urls: ['https://openrouter.ai/api/v1/videos/job_1/content'],
        usage: { cost: 0.5, is_byok: false },
      },
    )
  })
})
