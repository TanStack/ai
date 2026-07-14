import { chatParamsFromRequestBody } from '../../utilities/chat-params.js'
import { toServerSentEventsResponse } from '../../stream-to-response.js'
import { streamGenerationResult } from '../stream-generation-result.js'
import type {
  AssistantChatRequest,
  AssistantConfig,
  AssistantDefinition,
} from './types.js'

export type * from './types.js'

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null && typeof value === 'object' && Symbol.asyncIterator in value
  )
}

/**
 * Define a server-side assistant: a registry of per-capability callbacks
 * exposing a single request `handler`. Inert — no adapters, connections,
 * or other resources are constructed until a request actually arrives.
 */
export function defineAssistant<const T extends AssistantConfig>(
  config: T,
): AssistantDefinition<T> {
  const capabilities = Object.keys(config) as Array<keyof T & string>

  const handler = async (request: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response('Invalid JSON body', { status: 400 })
    }

    const bodyRecord = body as Record<string, unknown>
    const forwardedProps: Record<string, unknown> =
      (bodyRecord.forwardedProps as Record<string, unknown> | undefined) ??
      (bodyRecord.data as Record<string, unknown> | undefined) ??
      {}
    const capability = forwardedProps.capability
    // Gate on OWN, DECLARED capabilities only — `capabilities` is
    // `Object.keys(config)`, so this excludes inherited `Object.prototype`
    // members (`toString`, `valueOf`, `hasOwnProperty`, `constructor`, …)
    // that `capability in config` / `Reflect.get(config, capability)` would
    // otherwise treat as valid callbacks.
    const isDeclaredCapability =
      typeof capability === 'string' &&
      (capabilities as Array<string>).includes(capability)

    // `Reflect.get` returns `any`, so this is a single narrowing cast (not
    // `as unknown as`) — a per-key cast from `AssistantConfig` directly
    // fails structurally because callback params are contravariant per key.
    const callback = isDeclaredCapability
      ? (Reflect.get(config, capability) as ((req: any) => unknown) | undefined)
      : undefined

    if (!isDeclaredCapability || !callback) {
      return new Response(
        `Unknown assistant capability: ${String(capability)}`,
        { status: 400 },
      )
    }

    if (capability === 'chat') {
      // chatParamsFromRequestBody rejects with an AGUIError (not a thrown
      // Response) when the body doesn't conform to AG-UI's RunAgentInput
      // shape. Surface that as a 400, mirroring the e2e `api.chat.ts` route.
      let params
      try {
        params = await chatParamsFromRequestBody(body)
      } catch (error) {
        if (error instanceof Response) return error
        return new Response(
          error instanceof Error ? error.message : 'Invalid request body',
          { status: 400 },
        )
      }
      const chatReq: AssistantChatRequest = { ...params, request }
      const result = callback(chatReq)
      if (!isAsyncIterable(result)) {
        return new Response(
          'assistant chat capability must return a streaming ChatStream',
          { status: 400 },
        )
      }
      return toServerSentEventsResponse(result as AsyncIterable<any>)
    }

    // One-shot capabilities: validate the AG-UI envelope (same as `chat`),
    // then pull the generation input out of forwardedProps.
    let params
    try {
      params = await chatParamsFromRequestBody(body)
    } catch (error) {
      if (error instanceof Response) return error
      return new Response(
        error instanceof Error ? error.message : 'Invalid request body',
        { status: 400 },
      )
    }
    const { capability: _omit, ...input } = params.forwardedProps
    const oneShotReq = {
      ...input,
      threadId: params.threadId,
      runId: params.runId,
      ...(params.parentRunId !== undefined && {
        parentRunId: params.parentRunId,
      }),
      state: params.state,
      aguiContext: params.aguiContext,
      forwardedProps: params.forwardedProps,
      request,
    }
    const result = callback(oneShotReq)

    if (isAsyncIterable(result)) {
      // User opted into stream:true; the activity already emits generation:result.
      return toServerSentEventsResponse(result as AsyncIterable<any>)
    }
    // Non-streaming activity promise → wrap so the client's GenerationClient sees it.
    return toServerSentEventsResponse(
      streamGenerationResult(() => Promise.resolve(result), {
        threadId: params.threadId,
        runId: params.runId,
      }),
    )
  }

  return { capabilities, handler, '~caps': config }
}
