import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  toRunErrorPayload,
  toRunErrorRawEvent,
} from '@tanstack/ai/adapter-internals'
import { generateId } from '@tanstack/ai-utils'
import { extractRequestOptions } from '../utils/request-options'
import { makeStructuredOutputCompatibleWithMap } from '../utils/schema-converter'
import type { StructuredOutputCompatibility } from '../utils/schema-converter'
import { buildResponsesUsage } from '../usage'
import { convertToolsToResponsesFormat } from './responses-tool-converter'
import { processResponsesStream } from './responses-stream'
import type {
  LegacyReasoningDeltaEvent,
  StreamedFunctionCallMetadata,
} from './responses-stream'
import type OpenAI from 'openai'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  Response,
  ResponseCreateParams,
  ResponseFunctionCallOutputItem,
  ResponseInput,
  ResponseInputContent,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import type {
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'

// Base64 encoding of the '%PDF' file header — every PDF payload starts with
// these bytes, so inline document data must begin with this prefix.
const PDF_BASE64_MAGIC = 'JVBERi'

function toDataUrl(value: string, mime: string): string {
  return value.startsWith('data:') ? value : `data:${mime};base64,${value}`
}

function convertImagePartToInput(
  part: Extract<ContentPart, { type: 'image' }>,
): ResponseInputContent {
  const imageMetadata = part.metadata as
    | { detail?: 'auto' | 'low' | 'high' }
    | undefined
  if (part.source.type === 'url') {
    return {
      type: 'input_image',
      image_url: part.source.value,
      detail: imageMetadata?.detail || 'auto',
    }
  }
  const imageMime = part.source.mimeType || 'application/octet-stream'
  return {
    type: 'input_image',
    image_url: toDataUrl(part.source.value, imageMime),
    detail: imageMetadata?.detail || 'auto',
  }
}

function convertAudioPartToInput(
  part: Extract<ContentPart, { type: 'audio' }>,
): ResponseInputContent {
  if (part.source.type === 'url') {
    return {
      type: 'input_file',
      file_url: part.source.value,
    }
  }
  const audioMime = part.source.mimeType || 'application/octet-stream'
  return {
    type: 'input_file',
    file_data: toDataUrl(part.source.value, audioMime),
  }
}

function assertInlinePdf(
  documentValue: string,
  documentMime: string,
  adapterName: string,
): void {
  if (documentMime !== 'application/pdf') {
    throw new Error(
      `${adapterName} document parts only support application/pdf ` +
        `(received ${documentMime})`,
    )
  }
  // A pre-wrapped data URL carries its own media type — validate it too.
  const isNonPdfDataUrl =
    documentValue.startsWith('data:') &&
    !/^data:application\/pdf[;,]/i.test(documentValue)
  if (isNonPdfDataUrl) {
    throw new Error(
      `${adapterName} document parts only support application/pdf ` +
        `(received data URL with non-PDF media type)`,
    )
  }
  const documentBase64 = documentValue.startsWith('data:')
    ? /;base64,/i.test(documentValue)
      ? documentValue.slice(documentValue.indexOf(',') + 1)
      : ''
    : documentValue
  const isInvalidPdfBytes =
    Boolean(documentBase64) && !documentBase64.startsWith(PDF_BASE64_MAGIC)
  if (isInvalidPdfBytes) {
    throw new Error(
      `${adapterName} document parts only support application/pdf ` +
        `(inline data does not start with the %PDF header)`,
    )
  }
}

function convertDocumentPartToInput(
  part: Extract<ContentPart, { type: 'document' }>,
  adapterName: string,
): ResponseInputContent {
  const documentMetadata = part.metadata as
    | { filename?: string; detail?: 'auto' | 'low' | 'high' }
    | undefined
  const documentDetail =
    documentMetadata?.detail !== undefined
      ? { detail: documentMetadata.detail as 'low' | 'high' }
      : {}
  if (part.source.type === 'url') {
    // The Responses API fetches the PDF itself; filename and MIME
    // type are inferred from the response.
    return {
      type: 'input_file',
      file_url: part.source.value,
      ...documentDetail,
    }
  }
  const documentValue = part.source.value
  const documentMime = (
    (part.source.mimeType || 'application/pdf').split(';')[0] ?? ''
  )
    .trim()
    .toLowerCase()
  assertInlinePdf(documentValue, documentMime, adapterName)
  // Wrap raw base64 in a data URL — `input_file` rejects bare base64
  // payloads (matches the image and audio branches above).
  return {
    type: 'input_file',
    // The Responses API requires a filename alongside PDF `file_data`.
    filename: documentMetadata?.filename || 'document.pdf',
    file_data: toDataUrl(documentValue, documentMime),
    ...documentDetail,
  }
}

export interface OpenAIResponsesToolCallMetadata {
  itemId: string
}

export abstract class OpenAIBaseResponsesTextAdapter<
  TModel extends string,
  TProviderOptions extends Record<string, unknown> = Record<string, unknown>,
  TInputModalities extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
  TMessageMetadata extends DefaultMessageMetadataByModality =
    DefaultMessageMetadataByModality,
  TToolCapabilities extends ReadonlyArray<string> = ReadonlyArray<string>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  TMessageMetadata,
  TToolCapabilities,
  OpenAIResponsesToolCallMetadata
> {
  override readonly kind = 'text' as const
  readonly name: string
  protected client: OpenAI

  constructor(model: TModel, name: string, client: OpenAI) {
    super({}, model)
    this.name = name
    this.client = client
  }

  async *chatStream(
    options: TextOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const toolCallMetadata = new Map<string, StreamedFunctionCallMetadata>()

    const aguiState = {
      runId: options.runId ?? generateId(this.name),
      threadId: options.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      hasEmittedRunStarted: false,
    }

    try {
      const requestParams = this.mapOptionsToRequest(options)
      options.logger.request(
        `activity=chat provider=${this.name} model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: this.name, model: this.model },
      )
      const response = await this.client.responses.create(
        {
          ...requestParams,
          stream: true,
        },
        extractRequestOptions(options.request),
      )

      yield* this.processStreamChunks(
        response,
        toolCallMetadata,
        options,
        aguiState,
      )
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      const errorPayload = toRunErrorPayload(
        error,
        `${this.name}.chatStream failed`,
      )
      const rawEvent = toRunErrorRawEvent(error)

      // Emit RUN_STARTED if not yet emitted
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model: options.model,
          timestamp: Date.now(),
          parentRunId: options.parentRunId,
        }
      }

      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message: errorPayload.message,
        code: errorPayload.code,
        // Forward the provider's structured error body when present (see
        // toRunErrorRawEvent); omitted otherwise.
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: errorPayload.message,
          code: errorPayload.code,
        },
      }

      options.logger.errors(`${this.name}.chatStream fatal`, {
        error: errorPayload,
        source: `${this.name}.chatStream`,
      })
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<TProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapOptionsToRequest(chatOptions)

    // Apply provider-specific transformations for structured output compatibility
    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    try {
      const {
        stream: _stream,
        stream_options: _streamOptions,
        ...cleanParams
      } = requestParams as Record<string, unknown>
      void _stream
      void _streamOptions
      chatOptions.logger.request(
        `activity=structuredOutput provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )
      const response = await this.client.responses.create(
        {
          ...(cleanParams as Omit<ResponseCreateParams, 'stream'>),
          stream: false,
          // Configure structured output via text.format
          text: {
            format: {
              type: 'json_schema',
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        extractRequestOptions(chatOptions.request),
      )

      const rawText = this.extractTextFromResponse(response satisfies Response)

      if (rawText.length === 0) {
        throw new Error(
          `${this.name}.structuredOutput: response contained no content`,
        )
      }

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      // Provider-specific post-parse shaping (default passthrough). Null-widening
      // from strict mode is undone by the engine, not here.
      const transformed = this.transformStructuredOutput(parsed)

      // Surface usage so non-stream structured paths (and
      // fallbackStructuredOutputStream) can forward tokens to middleware.
      const usage = buildResponsesUsage(response.usage)
      return {
        data: transformed,
        rawText,
        ...(usage && { usage }),
      }
    } catch (error: unknown) {
      // Narrow before logging: raw SDK errors can carry request metadata
      // (including auth headers) which we must never surface to user loggers.
      chatOptions.logger.errors(`${this.name}.structuredOutput fatal`, {
        error: toRunErrorPayload(error, `${this.name}.structuredOutput failed`),
        source: `${this.name}.structuredOutput`,
      })
      throw error
    }
  }

  async *structuredOutputStream(
    options: StructuredOutputOptions<TProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const { chatOptions, outputSchema } = options
    const requestParams = this.mapOptionsToRequest(chatOptions)

    const jsonSchema = this.makeStructuredOutputCompatible(
      outputSchema,
      outputSchema.required,
    )

    const aguiState = {
      runId: generateId(this.name),
      threadId: chatOptions.threadId ?? generateId(this.name),
      messageId: generateId(this.name),
      hasEmittedRunStarted: false,
    }

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let hasEmittedTextMessageStart = false
    let reasoningMessageId: string | undefined
    let stepId: string | undefined
    let hasClosedReasoning = false
    let model: string = chatOptions.model
    let usage: OpenAI.Responses.Response['usage'] | undefined
    let stop = false
    const adapterName = this.name

    const joinDelta = (raw: unknown): string => {
      if (Array.isArray(raw)) return raw.join('')
      if (typeof raw === 'string') return raw
      return ''
    }

    const closeReasoning = function* (): Generator<AdapterYieldChunk> {
      if (reasoningMessageId && !hasClosedReasoning) {
        hasClosedReasoning = true
        yield {
          type: EventType.REASONING_MESSAGE_END,
          messageId: reasoningMessageId,
          model,
          timestamp: Date.now(),
        }
        yield {
          type: EventType.REASONING_END,
          messageId: reasoningMessageId,
          model,
          timestamp: Date.now(),
        }
        if (stepId) {
          yield {
            type: EventType.STEP_FINISHED,
            stepName: stepId,
            stepId,
            model,
            timestamp: Date.now(),
            content: accumulatedReasoning,
          }
        }
        reasoningMessageId = undefined
        stepId = undefined
        hasClosedReasoning = false
      }
    }

    const openReasoning = function* (): Generator<AdapterYieldChunk> {
      if (reasoningMessageId) return
      reasoningMessageId = generateId(adapterName)
      stepId = generateId(adapterName)
      yield {
        type: EventType.REASONING_START,
        messageId: reasoningMessageId,
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.REASONING_MESSAGE_START,
        messageId: reasoningMessageId,
        role: 'reasoning' as const,
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.STEP_STARTED,
        stepName: stepId,
        stepId,
        model,
        timestamp: Date.now(),
        stepType: 'thinking',
      }
    }

    type StructuredChunk = ResponseStreamEvent | LegacyReasoningDeltaEvent

    const handleCreatedOrProgress = (chunk: StructuredChunk): void => {
      const isLifecycleEvent =
        chunk.type === 'response.created' ||
        chunk.type === 'response.in_progress'
      if (!isLifecycleEvent) {
        return
      }
      if (!('response' in chunk)) return
      if (chunk.response.model) model = chunk.response.model
    }

    const handleRefusal = function* (
      chunk: StructuredChunk,
    ): Generator<AdapterYieldChunk> {
      if (chunk.type !== 'response.refusal.delta') return
      const delta = typeof chunk.delta === 'string' ? chunk.delta : ''
      yield {
        type: EventType.RUN_ERROR,
        runId: aguiState.runId,
        model,
        timestamp: Date.now(),
        message: `Model refused: ${delta}`,
        code: 'refusal',
        error: { message: `Model refused: ${delta}`, code: 'refusal' },
      }
      stop = true
    }

    const handleReasoningDelta = function* (
      chunk: StructuredChunk,
    ): Generator<AdapterYieldChunk> {
      const reasoningDelta = joinDelta(
        'delta' in chunk ? chunk.delta : undefined,
      )
      if (!reasoningDelta) return
      yield* openReasoning()
      // openReasoning() guarantees reasoningMessageId is set on first call;
      // TS can't see through the generator side-effect.
      if (!reasoningMessageId) return
      accumulatedReasoning += reasoningDelta
      yield {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: reasoningMessageId,
        delta: reasoningDelta,
        model,
        timestamp: Date.now(),
      }
    }

    const handleOutputTextDelta = function* (
      chunk: StructuredChunk,
    ): Generator<AdapterYieldChunk> {
      const textDelta = joinDelta('delta' in chunk ? chunk.delta : undefined)
      if (!textDelta) return

      yield* closeReasoning()

      if (!hasEmittedTextMessageStart) {
        hasEmittedTextMessageStart = true
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: aguiState.messageId,
          model,
          timestamp: Date.now(),
          role: 'assistant',
        }
      }
      accumulatedContent += textDelta
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: aguiState.messageId,
        model,
        timestamp: Date.now(),
        delta: textDelta,
        content: accumulatedContent,
      }
    }

    const handleCompleted = (chunk: StructuredChunk): void => {
      if (chunk.type !== 'response.completed') return
      if (chunk.response.usage) usage = chunk.response.usage
      if (chunk.response.model) model = chunk.response.model
    }

    const handleFailed = function* (
      chunk: StructuredChunk,
    ): Generator<AdapterYieldChunk> {
      if (chunk.type !== 'response.failed') return
      const response = chunk.response
      const message = response.error?.message || 'Responses API stream failed'
      const code = response.error?.code
      yield {
        type: EventType.RUN_ERROR,
        runId: aguiState.runId,
        model,
        timestamp: Date.now(),
        message,
        ...(code !== undefined && { code }),
        error: { message, ...(code !== undefined && { code }) },
      }
      stop = true
    }

    const structuredHandlers: Record<
      string,
      (chunk: StructuredChunk) => Generator<AdapterYieldChunk> | void
    > = {
      'response.created': handleCreatedOrProgress,
      'response.in_progress': handleCreatedOrProgress,
      'response.refusal.delta': handleRefusal,
      'response.reasoning_text.delta': handleReasoningDelta,
      'response.reasoning_summary_text.delta': handleReasoningDelta,
      'response.reasoning.delta': handleReasoningDelta,
      'response.output_text.delta': handleOutputTextDelta,
      'response.completed': handleCompleted,
      'response.failed': handleFailed,
    }

    const finalize = function* (
      transform: (parsed: unknown) => unknown,
    ): Generator<AdapterYieldChunk> {
      yield* closeReasoning()

      if (hasEmittedTextMessageStart) {
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: aguiState.messageId,
          model,
          timestamp: Date.now(),
        }
      }

      if (accumulatedContent.length === 0) {
        yield {
          type: EventType.RUN_ERROR,
          runId: aguiState.runId,
          model,
          timestamp: Date.now(),
          message: `${adapterName}.structuredOutputStream: response contained no content`,
          code: 'empty-response',
          error: {
            message: `${adapterName}.structuredOutputStream: response contained no content`,
            code: 'empty-response',
          },
        }
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(accumulatedContent)
      } catch {
        yield {
          type: EventType.RUN_ERROR,
          runId: aguiState.runId,
          model,
          timestamp: Date.now(),
          message: `Failed to parse structured output as JSON. Content: ${accumulatedContent.slice(0, 200)}${accumulatedContent.length > 200 ? '...' : ''}`,
          code: 'parse-error',
          error: {
            message: 'Failed to parse structured output as JSON',
            code: 'parse-error',
          },
        }
        return
      }

      const transformed = transform(parsed)

      yield {
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: {
          object: transformed,
          raw: accumulatedContent,
          ...(accumulatedReasoning ? { reasoning: accumulatedReasoning } : {}),
        },
        model,
        timestamp: Date.now(),
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId: aguiState.runId,
        threadId: aguiState.threadId,
        model,
        timestamp: Date.now(),
        finishReason: 'stop',
        ...(usage && {
          usage: buildResponsesUsage(usage),
        }),
      }
    }

    const handleFatal = function* (
      error: unknown,
      isAbort: boolean,
    ): Generator<AdapterYieldChunk> {
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId: aguiState.runId,
          threadId: aguiState.threadId,
          model,
          timestamp: Date.now(),
          parentRunId: chatOptions.parentRunId,
        }
      }

      const errorPayload = toRunErrorPayload(
        error,
        `${adapterName}.structuredOutputStream failed`,
      )

      const resolvedCode = isAbort ? 'aborted' : errorPayload.code
      const rawEvent = isAbort ? undefined : toRunErrorRawEvent(error)
      yield {
        type: EventType.RUN_ERROR,
        runId: aguiState.runId,
        model,
        timestamp: Date.now(),
        message: errorPayload.message,
        ...(resolvedCode !== undefined && { code: resolvedCode }),
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message: errorPayload.message,
          ...(resolvedCode !== undefined && { code: resolvedCode }),
        },
      }

      chatOptions.logger.errors(`${adapterName}.structuredOutputStream fatal`, {
        error: errorPayload,
        source: `${adapterName}.structuredOutputStream`,
      })
    }

    try {
      const { tools: _tools, ...cleanParams } = requestParams
      void _tools

      chatOptions.logger.request(
        `activity=structuredOutputStream provider=${this.name} model=${this.model} messages=${chatOptions.messages.length}`,
        { provider: this.name, model: this.model },
      )

      const stream: AsyncIterable<
        ResponseStreamEvent | LegacyReasoningDeltaEvent
      > = await this.client.responses.create(
        {
          ...cleanParams,
          stream: true,
          text: {
            format: {
              type: 'json_schema',
              name: 'structured_output',
              schema: jsonSchema,
              strict: true,
            },
          },
        },
        extractRequestOptions(chatOptions.request),
      )

      for await (const chunk of stream) {
        chatOptions.logger.provider(
          `provider=${this.name} type=${chunk.type}`,
          { provider: this.name, type: chunk.type },
        )

        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield {
            type: EventType.RUN_STARTED,
            runId: aguiState.runId,
            threadId: aguiState.threadId,
            model,
            timestamp: Date.now(),
            parentRunId: chatOptions.parentRunId,
          }
        }

        const handler = structuredHandlers[chunk.type]
        if (!handler) continue
        const produced = handler(chunk)
        if (produced) yield* produced
        if (stop) return
      }

      yield* finalize((parsed) => this.transformStructuredOutput(parsed))
    } catch (error: unknown) {
      yield* handleFatal(error, this.isAbortError(error))
    }
  }

  protected isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const e = error as { name?: unknown; code?: unknown }
    return (
      e.name === 'APIUserAbortError' ||
      e.name === 'AbortError' ||
      e.code === 'ERR_CANCELED'
    )
  }

  protected makeStructuredOutputCompatibleWithMap(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): StructuredOutputCompatibility {
    return makeStructuredOutputCompatibleWithMap(schema, originalRequired)
  }

  protected makeStructuredOutputCompatible(
    schema: Record<string, any>,
    originalRequired?: Array<string>,
  ): Record<string, any> {
    return this.makeStructuredOutputCompatibleWithMap(schema, originalRequired)
      .schema
  }

  protected transformStructuredOutput(parsed: unknown): unknown {
    return parsed
  }

  protected extractTextFromResponse(response: Response): string {
    let textContent = ''
    let refusal: string | undefined
    let sawMessageItem = false
    const observedItemTypes = new Set<string>()

    for (const item of response.output) {
      observedItemTypes.add(item.type)
      if (item.type === 'message') {
        sawMessageItem = true
        for (const part of item.content) {
          const partType = (part as { type: string }).type
          if (partType === 'output_text') {
            textContent += (part as { text?: string }).text ?? ''
          } else if (partType === 'refusal') {
            const refusalText = (part as { refusal?: string }).refusal
            refusal = refusalText || refusal || 'Refused without explanation'
          } else {
            throw new Error(
              `${this.name}.extractTextFromResponse: unsupported message content part type "${partType}"`,
            )
          }
        }
      }
    }

    if (!textContent && refusal !== undefined) {
      const err = new Error(`Model refused to respond: ${refusal}`)
      ;(err as Error & { code?: string }).code = 'refusal'
      throw err
    }

    const hasNonTextOutput =
      !textContent && response.output.length > 0 && !sawMessageItem
    if (hasNonTextOutput) {
      throw new Error(
        `${this.name}.extractTextFromResponse: response.output contained items of type(s) [${[...observedItemTypes].sort().join(', ')}] but no message text — the model returned a non-text response`,
      )
    }

    return textContent
  }

  protected async *processStreamChunks(
    stream: AsyncIterable<ResponseStreamEvent | LegacyReasoningDeltaEvent>,
    toolCallMetadata: Map<string, StreamedFunctionCallMetadata>,
    options: TextOptions<TProviderOptions>,
    aguiState: {
      runId: string
      threadId: string
      messageId: string
      hasEmittedRunStarted: boolean
    },
  ): AsyncIterable<AdapterYieldChunk> {
    yield* processResponsesStream({
      stream,
      toolCallMetadata,
      options,
      aguiState,
      adapterName: this.name,
      toCompatibility: (schema, required) =>
        this.makeStructuredOutputCompatibleWithMap(schema, required),
    })
  }

  protected mapOptionsToRequest(
    options: TextOptions<TProviderOptions>,
  ): Omit<ResponseCreateParams, 'stream'> {
    const input = this.convertMessagesToInput(options.messages)

    const tools = options.tools
      ? convertToolsToResponsesFormat(
          options.tools,
          this.makeStructuredOutputCompatible.bind(this),
        )
      : undefined

    const modelOptions = options.modelOptions

    const combinedSchema = options.outputSchema as
      | Record<string, unknown>
      | undefined
    const textFormat = combinedSchema
      ? {
          text: {
            format: {
              type: 'json_schema' as const,
              name: 'structured_output',
              schema: this.makeStructuredOutputCompatible(
                combinedSchema,
                Array.isArray(combinedSchema.required)
                  ? (combinedSchema.required as Array<string>)
                  : undefined,
              ),
              strict: true,
            },
          },
        }
      : undefined

    return {
      ...modelOptions,
      model: options.model,
      ...(options.metadata !== undefined && { metadata: options.metadata }),
      ...(() => {
        const prompts = normalizeSystemPrompts(options.systemPrompts)
        if (prompts.length === 0) return {}
        return { instructions: prompts.map((p) => p.content).join('\n') }
      })(),
      input,
      // Conditional spread: `tools: undefined` would clobber any
      // modelOptions.tools the caller set above.
      ...(tools && tools.length > 0 && { tools }),
      ...(textFormat ?? {}),
    }
  }

  supportsCombinedToolsAndSchema(): boolean {
    return true
  }

  protected convertMessagesToInput(
    messages: Array<ModelMessage>,
  ): ResponseInput {
    const result: ResponseInput = []

    for (const message of messages) {
      // Handle tool messages - convert to FunctionToolCallOutput
      if (message.role === 'tool') {
        const toolContent = message.content
        const output: string | Array<ResponseFunctionCallOutputItem> =
          Array.isArray(toolContent)
            ? toolContent.map((part) => this.convertContentPartToInput(part))
            : typeof toolContent === 'string'
              ? toolContent
              : JSON.stringify(toolContent)
        result.push({
          type: 'function_call_output',
          call_id: message.toolCallId || '',
          output,
        })
        continue
      }

      // Handle assistant messages
      if (message.role === 'assistant') {
        // If the assistant message has tool calls, add them as FunctionToolCall objects
        // Responses API expects arguments as a string (JSON string)
        if (message.toolCalls && message.toolCalls.length > 0) {
          for (const toolCall of message.toolCalls) {
            // Keep arguments as string for Responses API
            const argumentsString =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments)
            const itemId = (
              toolCall.metadata as OpenAIResponsesToolCallMetadata | undefined
            )?.itemId

            result.push({
              type: 'function_call',
              call_id: toolCall.id,
              ...(itemId && { id: itemId }),
              name: toolCall.function.name,
              arguments: argumentsString,
            })
          }
        }

        // Add the assistant's text message if there is content
        if (message.content) {
          const contentStr = this.extractTextContent(message.content)
          if (contentStr) {
            result.push({
              type: 'message',
              role: 'assistant',
              content: contentStr,
            })
          }
        }

        continue
      }

      // Handle user messages (default case) — support multimodal content
      const contentParts = this.normalizeContent(message.content)
      const inputContent: Array<ResponseInputContent> = []

      for (const part of contentParts) {
        inputContent.push(this.convertContentPartToInput(part))
      }

      if (inputContent.length === 0) {
        throw new Error(
          `User message for ${this.name} has no content parts. ` +
            `Empty user messages would produce a paid request with no input; ` +
            `provide at least one text/image/audio/document part or omit the message.`,
        )
      }

      result.push({
        type: 'message',
        role: 'user',
        content: inputContent,
      })
    }

    return result
  }

  protected convertContentPartToInput(part: ContentPart): ResponseInputContent {
    switch (part.type) {
      case 'text':
        return {
          type: 'input_text',
          text: part.content,
        }
      case 'image':
        return convertImagePartToInput(part)
      case 'audio':
        return convertAudioPartToInput(part)
      case 'document':
        return convertDocumentPartToInput(part, this.name)
      case 'video':
      default:
        throw new Error(`Unsupported content part type: ${part.type}`)
    }
  }

  protected normalizeContent(
    content: string | null | undefined | Array<ContentPart>,
  ): Array<ContentPart> {
    const hasNoContent = content === null || content === undefined
    if (hasNoContent) {
      return []
    }
    if (typeof content === 'string') {
      return [{ type: 'text', content: content }]
    }
    return content
  }

  protected extractTextContent(
    content: string | null | undefined | Array<ContentPart>,
  ): string {
    const hasNoContent = content === null || content === undefined
    if (hasNoContent) {
      return ''
    }
    if (typeof content === 'string') {
      return content
    }
    // It's an array of ContentPart
    return content
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
  }
}
