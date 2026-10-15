import { z } from 'zod'
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
  createMcpHandler,
  inputRequired,
} from '@modelcontextprotocol/server'
import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS } from '@tanstack/ai-harness'
import type {
  ElicitRequestFormParams,
  ElicitRequestURLParams,
  InputRequest,
} from '@modelcontextprotocol/server'
import type { AnyTextAdapter, StreamChunk, TextOptions } from '@tanstack/ai'
import type { HarnessSession } from '@tanstack/ai-harness'

/** A text adapter for the connector tests. Only `chatStream` changes. */
export function mockTextAdapter(chatStream: AnyTextAdapter['chatStream']) {
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'mock',
    '~types': {
      providerOptions: {},
      inputModalities: ['text'],
      messageMetadataByModality: {
        text: undefined,
        image: undefined,
        audio: undefined,
        video: undefined,
        document: undefined,
      },
      toolCapabilities: [],
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream,
  }
  return adapter
}

/** A model that records the calls it gets, calls `tool` once, then stops. */
export function recorder(tool?: string) {
  const calls: Array<TextOptions> = []
  const now = () => Date.now()
  const adapter = mockTextAdapter((options) => {
    calls.push(options)
    const first = calls.length === 1 && tool !== undefined
    return (async function* (): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: now(),
      }
      if (first) {
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'c1',
          toolCallName: tool,
          timestamp: now(),
        }
        yield {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'c1',
          delta: '{"text":"hi"}',
          timestamp: now(),
        }
        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId: 'c1',
          timestamp: now(),
        }
      }
      yield {
        type: EventType.RUN_FINISHED,
        runId: 'r',
        threadId: 't',
        timestamp: now(),
        metadata: {
          tanstack: { finishReason: first ? 'tool_calls' : 'stop' },
        },
      }
    })()
  })
  const toolNames = (index: number) =>
    (calls[index]?.tools ?? []).map((entry) => entry.name)
  return { adapter, calls, toolNames }
}

/** The sign-in URL of a `harness.auth_required` event, or `undefined`. */
export function authorizationUrlOf(event: StreamChunk) {
  if (
    event.type !== EventType.CUSTOM ||
    event.name !== HARNESS_EVENTS.authRequired
  )
    return undefined
  const value: unknown = event.value
  if (typeof value !== 'object' || value === null || !('url' in value))
    return undefined
  return typeof value.url === 'string' ? new URL(value.url) : undefined
}

/**
 * Act as the user's browser for `/connect`: approve each sign-in the session
 * asks for by calling its loopback redirect with `code` and the same `state`.
 */
export function approveSignIns(
  session: HarnessSession,
  code: string,
  /** The `iss` the fake server sends back with the code (RFC 9207). */
  iss?: string,
) {
  const authorizationUrls: Array<URL> = []
  const controller = new AbortController()
  void (async () => {
    for await (const entry of session.events({ signal: controller.signal })) {
      const authorizationUrl = authorizationUrlOf(entry.event)
      if (!authorizationUrl) continue
      authorizationUrls.push(authorizationUrl)
      const redirect = new URL(
        authorizationUrl.searchParams.get('redirect_uri') ?? '',
      )
      redirect.searchParams.set('code', code)
      if (iss) redirect.searchParams.set('iss', iss)
      redirect.searchParams.set(
        'state',
        authorizationUrl.searchParams.get('state') ?? '',
      )
      await fetch(redirect)
    }
  })()
  return { authorizationUrls, stop: () => controller.abort() }
}

/**
 * A spec 2026 server with one `book` tool. The first call asks for `input`.
 * The retry records the answer in `answers` and ends the call.
 */
export function elicitServer(input: InputRequest) {
  const answers: Array<unknown> = []
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'trips', version: '1.0.0' })
      server.registerTool(
        'book',
        {
          description: 'Book a trip',
          inputSchema: z.object({ text: z.string() }),
        },
        (_args, ctx) => {
          const responses = ctx.mcpReq.inputResponses
          if (responses === undefined) {
            return inputRequired({ inputRequests: { trip: input } })
          }
          answers.push(responses.trip)
          return { content: [{ type: 'text', text: 'booked' }] }
        },
      )
      return server
    },
    { legacy: 'reject', keepAliveMs: 0 },
  )
  return { answers, fetch: (request: Request) => handler.fetch(request) }
}

/** The form the `book` tool of {@link elicitServer} asks for. */
export const tripForm = {
  message: 'Which city?',
  requestedSchema: {
    type: 'object' as const,
    properties: { city: { type: 'string' as const } },
    required: ['city'],
  },
}

/**
 * A spec 2025 server with one `book` tool. The tool sends each of `asks` to
 * the client as an `elicitation/create` request, and records each answer in
 * `answers`.
 */
export async function legacyElicitServer(
  asks: Array<ElicitRequestFormParams | ElicitRequestURLParams>,
) {
  const answers: Array<unknown> = []
  const server = new McpServer({ name: 'trips', version: '1.0.0' })
  server.registerTool(
    'book',
    {
      description: 'Book a trip',
      inputSchema: z.object({ text: z.string() }),
    },
    async (_args, ctx) => {
      for (const ask of asks) answers.push(await ctx.mcpReq.elicitInput(ask))
      return { content: [{ type: 'text', text: 'booked' }] }
    },
  )
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  })
  await server.connect(transport)
  return {
    answers,
    fetch: (request: Request) => transport.handleRequest(request),
  }
}

/**
 * A spec 2026 server with one `book` tool that asks for each of `inputs` in
 * turn, one round each. `requestState` carries the round. The retries record
 * the answers in `answers`.
 */
export function roundsServer(inputs: Array<InputRequest>) {
  const answers: Array<unknown> = []
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: 'trips', version: '1.0.0' })
      server.registerTool(
        'book',
        {
          description: 'Book a trip',
          inputSchema: z.object({ text: z.string() }),
        },
        (_args, ctx) => {
          const state: unknown = ctx.mcpReq.requestState()
          const round = typeof state === 'string' ? Number(state) : 0
          const responses = ctx.mcpReq.inputResponses
          if (responses !== undefined) answers.push(responses[`r${round - 1}`])
          const input = inputs[round]
          if (input === undefined) {
            return { content: [{ type: 'text', text: 'booked' }] }
          }
          return inputRequired({
            inputRequests: { [`r${round}`]: input },
            requestState: String(round + 1),
          })
        },
      )
      return server
    },
    { legacy: 'reject', keepAliveMs: 0 },
  )
  return { answers, fetch: (request: Request) => handler.fetch(request) }
}
