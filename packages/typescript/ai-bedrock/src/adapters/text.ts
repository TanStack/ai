import {
    BedrockRuntimeClient,
    ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime'
import {
    BaseTextAdapter,
} from '@tanstack/ai/adapters'
import { isClaude, isNova } from '../model-meta'
import { generateIdFor } from '../utils'
import type { BedrockModelId } from '../model-meta'
import type { ContentBlock, Message, ToolResultBlock, ToolUseBlock } from '@aws-sdk/client-bedrock-runtime'
import type {
    StructuredOutputOptions,
    StructuredOutputResult,
} from '@tanstack/ai/adapters'
import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import type {
    DefaultMessageMetadataByModality,
    ModelMessage,
    StreamChunk,
    TextOptions,
} from '@tanstack/ai'
import type { BedrockTextProviderOptions } from '../text/text-provider-options'

/**
 * Configuration for the AWS Bedrock client.
 */
export interface BedrockTextConfig {
    /**
     * AWS region where Bedrock is accessed (e.g. `'us-east-1'`).
     * When omitted, reads from `AWS_REGION` or `AWS_DEFAULT_REGION` env vars.
     */
    region?: string
    /**
     * AWS IAM credentials (access key + secret key).
     *
     * Use for programmatic access with long-lived or STS temporary credentials.
     * Cannot be combined with `apiKey`.
     */
    credentials?: {
        /** AWS access key ID. */
        accessKeyId: string
        /** AWS secret access key. */
        secretAccessKey: string
        /** Temporary session token (for STS / assumed roles). */
        sessionToken?: string
    }
    /**
     * Bedrock API key (bearer token) for authentication.
     *
     * Generate short-term or long-term keys via the AWS Console or CLI.
     * Passed as `Authorization: Bearer <apiKey>`.
     * Cannot be combined with `credentials`.
     *
     * @see https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html
     */
    apiKey?: string
}

/**
 * Supported input modalities for Bedrock text adapters.
 * Nova Micro only supports `'text'`; other models support the full set.
 */
export type BedrockInputModalities = readonly ['text', 'image', 'video', 'document']

/**
 * Text adapter for Amazon Bedrock using the unified ConverseStream API.
 *
 * Supports Amazon Nova and Anthropic Claude models with streaming, tool calling,
 * multimodal inputs (text, image, video, document), and extended thinking.
 *
 * @example
 * ```typescript
 * import { bedrockText } from '@tanstack/ai-bedrock'
 * import { chat } from '@tanstack/ai'
 *
 * const stream = chat({
 *   adapter: bedrockText('amazon.nova-pro-v1:0'),
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * })
 * ```
 */
export class BedrockTextAdapter<
    TModel extends BedrockModelId = BedrockModelId,
> extends BaseTextAdapter<
    TModel,
    BedrockTextProviderOptions,
    BedrockInputModalities,
    DefaultMessageMetadataByModality
> {
    readonly kind = 'text' as const
    readonly name = 'bedrock' as const

    private client: BedrockRuntimeClient

    /**
     * @param config - AWS region and credentials for the Bedrock client.
     * @param model - The Bedrock model ID to use for requests.
     */
    constructor(config: BedrockTextConfig, model: TModel) {
        super({}, model)
        this.client = new BedrockRuntimeClient({
            ...(config.region ? { region: config.region } : {}),
            // API key (bearer token) — takes precedence over IAM credentials
            ...(config.apiKey ? { token: config.apiKey } : {}),
            // IAM credentials — only when no API key is set
            ...(!config.apiKey && config.credentials
                ? { credentials: config.credentials }
                : {}),
        })
    }

    /**
     * Streams a chat completion from the Bedrock ConverseStream API.
     * Yields AG-UI protocol {@link StreamChunk} events.
     *
     * @param options - Text generation options (messages, tools, modelOptions, etc.)
     */
    async *chatStream(
        options: TextOptions<BedrockTextProviderOptions>,
    ): AsyncIterable<StreamChunk> {
        const threadId = options.threadId || options.conversationId || this.generateId()
        const runId = options.runId || this.generateId()
        const parentRunId = options.parentRunId
        const timestamp = Date.now()
        const model = this.model

        try {
            // Convert messages to Converse format (unified across all models)
            const messages = options.messages.map(m => this.convertToConverseMessage(m))

            // Normalise system prompts via the SDK utility
            const system = normalizeSystemPrompts(options.systemPrompts).map(
                p => ({ text: p.content }),
            )

            const command = new ConverseStreamCommand({
                modelId: model,
                messages,
                system: system?.length ? system : undefined,
                inferenceConfig: {
                    maxTokens: options.maxTokens,
                    temperature: options.temperature,
                    topP: options.topP,
                    ...options.modelOptions?.inferenceConfig,
                },
                toolConfig: options.tools?.length ? {
                    tools: options.tools.map(t => ({
                        toolSpec: {
                            name: t.name,
                            description: t.description,
                            inputSchema: { json: t.inputSchema },
                        },
                    })),
                } : undefined,
                // Model-specific extended features via additionalModelRequestFields
                additionalModelRequestFields: (() => {
                    if (isClaude(model) && options.modelOptions?.thinking && options.messages.length === 1) {
                        // Claude: native thinking support (only first turn)
                        return { thinking: options.modelOptions.thinking }
                    }
                    if (isNova(model) && options.modelOptions?.thinking) {
                        // Nova: extended thinking via reasoningConfig
                        // Note: produces <thinking> tags in text (parsed universally below)
                        return {
                            reasoningConfig: {
                                enabled: true,
                                maxReasoningEffort: 'medium',
                            },
                        }
                    }
                    return undefined
                })() as any, // Type assertion for AWS SDK DocumentType
            })

            const response = await this.client.send(command)

            if (!response.stream) {
                yield {
                    type: EventType.RUN_ERROR,
                    threadId,
                    runId,
                    model,
                    timestamp: Date.now(),
                    message: 'No stream received from Bedrock',
                    error: {
                        message: 'No stream received from Bedrock',
                        code: 'NO_STREAM',
                    },
                }
                return
            }

            yield* this.processConverseStream(response.stream, {
                threadId,
                runId,
                parentRunId,
                model,
            })
        } catch (error: unknown) {
            const err = error as Error & { name?: string }
            yield {
                type: EventType.RUN_ERROR,
                threadId,
                runId,
                model,
                timestamp: Date.now(),
                message: err.message || 'Unknown Bedrock error',
                error: {
                    message: err.message || 'Unknown Bedrock error',
                    code: err.name || 'INTERNAL_ERROR',
                },
            }
        }
    }

    /**
     * Structured output is not yet supported for the Bedrock ConverseStream API.
     * @throws Always rejects with a not-implemented error.
     */
    structuredOutput(
        _options: StructuredOutputOptions<BedrockTextProviderOptions>,
    ): Promise<StructuredOutputResult<unknown>> {
        // TODO: Migrate to Converse API for structured output
        return Promise.reject(new Error('Structured output not yet migrated to ConverseStream API'))
    }

    /**
     * Convert ModelMessage to Converse API message format (unified across all models)
     */
    private convertToConverseMessage(message: ModelMessage): Message {
        // Handle tool result messages
        if (message.role === 'tool' && message.toolCallId) {
            const contentText = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
            let contentBlock: any = { text: contentText }

            // Try to parse as JSON for better structure
            try {
                const parsed = JSON.parse(contentText)
                contentBlock = { json: parsed }
            } catch {
                // Keep as text
            }

            return {
                role: 'user',
                content: [{
                    toolResult: {
                        toolUseId: message.toolCallId,
                        content: [contentBlock],
                        status: ((message as any).status === 'error' || (message as any).error) ? 'failure' : 'success',
                    } as ToolResultBlock
                }]
            }
        }

        // Handle assistant messages with tool calls
        if (message.role === 'assistant' && message.toolCalls?.length) {
            const content: Array<ContentBlock> = []

            // Add text content if present
            if (typeof message.content === 'string' && message.content) {
                content.push({ text: message.content })
            } else if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    const block = this.convertPartToConverseBlock(part)
                    if (block) content.push(block)
                }
            }

            // Add tool use blocks
            for (const tc of message.toolCalls) {
                let input = tc.function.arguments
                if (typeof input === 'string') {
                    try {
                        input = JSON.parse(input)
                    } catch {
                        // Keep as string if parsing fails
                    }
                }

                content.push({
                    toolUse: {
                        toolUseId: tc.id,
                        name: tc.function.name,
                        input
                    } as ToolUseBlock
                })
            }

            return { role: 'assistant', content }
        }

        // Handle regular messages (user or assistant)
        const content: Array<ContentBlock> = []

        if (typeof message.content === 'string') {
            content.push({ text: message.content })
        } else if (Array.isArray(message.content)) {
            for (const part of message.content) {
                const block = this.convertPartToConverseBlock(part)
                if (block) content.push(block)
            }
        }

        return {
            role: message.role === 'user' ? 'user' : 'assistant',
            content
        }
    }

    /**
     * Convert message part to Converse content block
     */
    private convertPartToConverseBlock(part: any): ContentBlock | null {
        if (part.type === 'text') {
            return { text: part.content }
        }
        if (part.type === 'image') {
            return {
                image: {
                    format: (part.metadata)?.mediaType?.split('/')[1] || 'jpeg',
                    source: { bytes: part.source.value }
                }
            }
        }
        if (part.type === 'video') {
            return {
                video: {
                    format: (part.metadata)?.mediaType?.split('/')[1] || 'mp4',
                    source: { bytes: part.source.value }
                }
            }
        }
        if (part.type === 'document') {
            return {
                document: {
                    format: (part.metadata)?.mediaType?.split('/')[1] || 'pdf',
                    source: { bytes: part.source.value },
                    name: (part.metadata)?.name || 'document'
                }
            }
        }
        // Skip thinking parts - they're not sent back to the model in Converse API
        return null
    }

    /**
     * Process ConverseStream events and yield AG-UI protocol StreamChunks.
     */
    private async *processConverseStream(
        stream: AsyncIterable<any>,
        ctx: {
            threadId: string
            runId: string
            parentRunId?: string
            model: string
        },
    ): AsyncIterable<StreamChunk> {
        const { threadId, runId, parentRunId, model } = ctx
        const timestamp = Date.now()

        // Track state for proper AG-UI lifecycle events
        let hasEmittedRunStarted = false
        let hasEmittedTextMessageStart = false
        const messageId = generateIdFor('msg', this.name)
        let hasClosedText = false

        // Reasoning state
        let hasEmittedReasoning = false
        const reasoningMessageId = generateIdFor('reasoning', this.name)
        let hasClosedReasoning = false

        // Tool state
        let toolCallIndex = -1
        const activeToolCalls = new Map<string, { name: string; index: number; started: boolean }>()

        // Content parsing state
        let accumulatedContent = ''
        let isInsideThinking = false
        let pendingTagBuffer = ''
        let accumulatedThinking = ''

        // Track final metadata
        let lastUsage: any | undefined

        for await (const event of stream) {
            // Emit RUN_STARTED on first chunk
            if (!hasEmittedRunStarted) {
                hasEmittedRunStarted = true
                yield {
                    type: EventType.RUN_STARTED,
                    threadId,
                    runId,
                    model,
                    timestamp,
                    parentRunId,
                } as StreamChunk
            }

            // Content block delta (text generation, reasoning, tool input)
            if (event.contentBlockDelta) {
                const delta = event.contentBlockDelta.delta

                // --- Claude native reasoning (delta.reasoningContent.text) ---
                if (delta?.reasoningContent?.text !== undefined) {
                    if (!hasEmittedReasoning) {
                        hasEmittedReasoning = true
                        yield {
                            type: EventType.REASONING_START,
                            messageId: reasoningMessageId,
                            model,
                            timestamp: Date.now(),
                        } as StreamChunk
                        yield {
                            type: EventType.REASONING_MESSAGE_START,
                            messageId: reasoningMessageId,
                            role: 'reasoning' as const,
                            model,
                            timestamp: Date.now(),
                        } as StreamChunk
                    }

                    const reasoningDelta = delta.reasoningContent.text
                    accumulatedThinking += reasoningDelta
                    yield {
                        type: EventType.REASONING_MESSAGE_CONTENT,
                        messageId: reasoningMessageId,
                        delta: reasoningDelta,
                        model,
                        timestamp: Date.now(),
                    } as StreamChunk
                    continue
                }

                // Signature-only delta — silently ignored
                if (delta?.reasoningContent?.signature !== undefined) {
                    continue
                }

                // --- Text content (with <thinking> tag parsing for Nova) ---
                if (delta?.text) {
                    // Close reasoning before text starts
                    if (hasEmittedReasoning && !hasClosedReasoning) {
                        hasClosedReasoning = true
                        yield {
                            type: EventType.REASONING_MESSAGE_END,
                            messageId: reasoningMessageId,
                            model,
                            timestamp: Date.now(),
                        } as StreamChunk
                        yield {
                            type: EventType.REASONING_END,
                            messageId: reasoningMessageId,
                            model,
                            timestamp: Date.now(),
                        } as StreamChunk
                    }

                    // Parse <thinking> tags embedded in text (Nova models)
                    let text = pendingTagBuffer + delta.text
                    pendingTagBuffer = ''

                    while (text.length > 0) {
                        if (!isInsideThinking) {
                            const startIdx = text.indexOf('<thinking>')
                            if (startIdx !== -1) {
                                // Emit content before the tag
                                if (startIdx > 0) {
                                    const before = text.substring(0, startIdx)
                                    if (!hasEmittedTextMessageStart) {
                                        hasEmittedTextMessageStart = true
                                        yield {
                                            type: EventType.TEXT_MESSAGE_START,
                                            messageId,
                                            model,
                                            timestamp: Date.now(),
                                            role: 'assistant',
                                        } as StreamChunk
                                    }
                                    accumulatedContent += before
                                    yield {
                                        type: EventType.TEXT_MESSAGE_CONTENT,
                                        messageId,
                                        delta: before,
                                        content: accumulatedContent,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                }

                                // Start thinking
                                if (!hasEmittedReasoning) {
                                    hasEmittedReasoning = true
                                    yield {
                                        type: EventType.REASONING_START,
                                        messageId: reasoningMessageId,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                    yield {
                                        type: EventType.REASONING_MESSAGE_START,
                                        messageId: reasoningMessageId,
                                        role: 'reasoning' as const,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                }
                                isInsideThinking = true
                                text = text.substring(startIdx + '<thinking>'.length)
                            } else if (text.includes('<')) {
                                // Possible partial <thinking> tag — buffer
                                const idx = text.lastIndexOf('<')
                                const before = text.substring(0, idx)
                                if (before) {
                                    if (!hasEmittedTextMessageStart) {
                                        hasEmittedTextMessageStart = true
                                        yield {
                                            type: EventType.TEXT_MESSAGE_START,
                                            messageId,
                                            model,
                                            timestamp: Date.now(),
                                            role: 'assistant',
                                        } as StreamChunk
                                    }
                                    accumulatedContent += before
                                    yield {
                                        type: EventType.TEXT_MESSAGE_CONTENT,
                                        messageId,
                                        delta: before,
                                        content: accumulatedContent,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                }
                                pendingTagBuffer = text.substring(idx)
                                break
                            } else {
                                if (!hasEmittedTextMessageStart) {
                                    hasEmittedTextMessageStart = true
                                    yield {
                                        type: EventType.TEXT_MESSAGE_START,
                                        messageId,
                                        model,
                                        timestamp: Date.now(),
                                        role: 'assistant',
                                    } as StreamChunk
                                }
                                accumulatedContent += text
                                yield {
                                    type: EventType.TEXT_MESSAGE_CONTENT,
                                    messageId,
                                    delta: text,
                                    content: accumulatedContent,
                                    model,
                                    timestamp: Date.now(),
                                } as StreamChunk
                                break
                            }
                        } else {
                            // Inside <thinking> tag
                            const endIdx = text.indexOf('</thinking>')
                            if (endIdx !== -1) {
                                if (endIdx > 0) {
                                    const thinking = text.substring(0, endIdx)
                                    accumulatedThinking += thinking
                                    yield {
                                        type: EventType.REASONING_MESSAGE_CONTENT,
                                        messageId: reasoningMessageId,
                                        delta: thinking,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                }
                                isInsideThinking = false
                                // Close reasoning
                                if (!hasClosedReasoning) {
                                    hasClosedReasoning = true
                                    yield {
                                        type: EventType.REASONING_MESSAGE_END,
                                        messageId: reasoningMessageId,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                    yield {
                                        type: EventType.REASONING_END,
                                        messageId: reasoningMessageId,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                }
                                text = text.substring(endIdx + '</thinking>'.length) // 11 chars
                            } else if (text.includes('<')) {
                                const idx = text.lastIndexOf('<')
                                const thinking = text.substring(0, idx)
                                if (thinking) {
                                    accumulatedThinking += thinking
                                    yield {
                                        type: EventType.REASONING_MESSAGE_CONTENT,
                                        messageId: reasoningMessageId,
                                        delta: thinking,
                                        model,
                                        timestamp: Date.now(),
                                    } as StreamChunk
                                }
                                pendingTagBuffer = text.substring(idx)
                                break
                            } else {
                                accumulatedThinking += text
                                yield {
                                    type: EventType.REASONING_MESSAGE_CONTENT,
                                    messageId: reasoningMessageId,
                                    delta: text,
                                    model,
                                    timestamp: Date.now(),
                                } as StreamChunk
                                break
                            }
                        }
                    }
                }

                // --- Tool input (arguments) ---
                if (delta?.toolUse?.input) {
                    const inputDelta = delta.toolUse.input
                    // Find the active tool call (started by contentBlockStart)
                    const active = [...activeToolCalls.values()].find(t => t.started)
                    if (active) {
                        yield {
                            type: EventType.TOOL_CALL_ARGS,
                            toolCallId: [...activeToolCalls.keys()].find(
                                k => activeToolCalls.get(k) === active,
                            )!,
                            delta: inputDelta,
                            model,
                            timestamp: Date.now(),
                        } as StreamChunk
                    }
                }
            }

            // Content block start (for tool use — name + id revealed first)
            if (event.contentBlockStart?.start?.toolUse) {
                const toolUse = event.contentBlockStart.start.toolUse
                toolCallIndex++
                const toolCallId = toolUse.toolUseId
                activeToolCalls.set(toolCallId, {
                    name: toolUse.name,
                    index: toolCallIndex,
                    started: true,
                })

                yield {
                    type: EventType.TOOL_CALL_START,
                    toolCallId,
                    toolCallName: toolUse.name,
                    model,
                    timestamp: Date.now(),
                    index: toolCallIndex,
                } as StreamChunk
            }

            // Content block stop (tool call arguments complete)
            if (event.contentBlockStop) {
                // Find any tool call whose args just finished
                for (const [toolCallId, tc] of activeToolCalls) {
                    if (tc.started) {
                        yield {
                            type: EventType.TOOL_CALL_END,
                            toolCallId,
                            model,
                            timestamp: Date.now(),
                        } as StreamChunk
                        tc.started = false
                    }
                }
            }

            // Message stop (completion)
            if (event.messageStop) {
                // Close reasoning if still open
                if (hasEmittedReasoning && !hasClosedReasoning) {
                    hasClosedReasoning = true
                    yield {
                        type: EventType.REASONING_MESSAGE_END,
                        messageId: reasoningMessageId,
                        model,
                        timestamp: Date.now(),
                    } as StreamChunk
                    yield {
                        type: EventType.REASONING_END,
                        messageId: reasoningMessageId,
                        model,
                        timestamp: Date.now(),
                    } as StreamChunk
                }

                // End text message if started
                if (hasEmittedTextMessageStart && !hasClosedText) {
                    hasClosedText = true
                    yield {
                        type: EventType.TEXT_MESSAGE_END,
                        messageId,
                        model,
                        timestamp: Date.now(),
                    } as StreamChunk
                }
            }

            // Metadata (token usage)
            if (event.metadata?.usage) {
                lastUsage = event.metadata.usage
            }
        }

        // Ensure text message end is emitted if not done by messageStop
        if (hasEmittedTextMessageStart && !hasClosedText) {
            hasClosedText = true
            yield {
                type: EventType.TEXT_MESSAGE_END,
                messageId,
                model,
                timestamp: Date.now(),
            } as StreamChunk
        }

        // Close reasoning if still open
        if (hasEmittedReasoning && !hasClosedReasoning) {
            hasClosedReasoning = true
            yield {
                type: EventType.REASONING_MESSAGE_END,
                messageId: reasoningMessageId,
                model,
                timestamp: Date.now(),
            } as StreamChunk
            yield {
                type: EventType.REASONING_END,
                messageId: reasoningMessageId,
                model,
                timestamp: Date.now(),
            } as StreamChunk
        }

        // Build usage from metadata
        const usage = lastUsage
            ? {
                  promptTokens: lastUsage.inputTokens ?? 0,
                  completionTokens: lastUsage.outputTokens ?? 0,
                  totalTokens:
                      lastUsage.totalTokens ??
                      (lastUsage.inputTokens ?? 0) + (lastUsage.outputTokens ?? 0),
              }
            : undefined

        // Emit RUN_FINISHED
        yield {
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
            model,
            timestamp: Date.now(),
            usage,
        } as StreamChunk
    }
}
