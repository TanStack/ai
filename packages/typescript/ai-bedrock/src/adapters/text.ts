import {
    BedrockRuntimeClient,

    ConverseStreamCommand



} from '@aws-sdk/client-bedrock-runtime'
import {
    BaseTextAdapter
} from '@tanstack/ai/adapters'
import {

    isClaude,
    isNova
} from '../model-meta'
import type { BedrockModelId } from '../model-meta';
import type { ContentBlock, Message, ToolResultBlock, ToolUseBlock } from '@aws-sdk/client-bedrock-runtime';
import type {
    StructuredOutputOptions,
    StructuredOutputResult
} from '@tanstack/ai/adapters';
import type {
    DefaultMessageMetadataByModality,
    ModelMessage,
    StreamChunk,
    TextOptions,
} from '@tanstack/ai'
import type { BedrockTextProviderOptions } from '../text/text-provider-options'

export interface BedrockTextConfig {
    region: string
    credentials: {
        accessKeyId: string
        secretAccessKey: string
    }
}

export type BedrockInputModalities = readonly ['text', 'image', 'video', 'document']

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

    constructor(config: BedrockTextConfig, model: TModel) {
        super({}, model)
        this.client = new BedrockRuntimeClient({
            region: config.region,
            credentials: config.credentials,
        })
    }

    async *chatStream(
        options: TextOptions<BedrockTextProviderOptions>,
    ): AsyncIterable<StreamChunk> {
        const id = this.generateId()
        const timestamp = Date.now()

        try {
            // Convert messages to Converse format (unified across all models)
            const messages = options.messages.map(m => this.convertToConverseMessage(m))

            const command = new ConverseStreamCommand({
                modelId: this.model,
                messages,
                system: options.systemPrompts?.map(text => ({ text })),
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
                        }
                    }))
                } : undefined,
                // Model-specific extended features via additionalModelRequestFields
                additionalModelRequestFields: (() => {
                    if (isClaude(this.model) && options.modelOptions?.thinking && options.messages.length === 1) {
                        // Claude: native thinking support (only first turn)
                        return { thinking: options.modelOptions.thinking }
                    }
                    if (isNova(this.model) && options.modelOptions?.thinking) {
                        // Nova: extended thinking via reasoningConfig
                        // Note: produces <thinking> tags in text (parsed universally below)
                        return {
                            reasoningConfig: {
                                enabled: true,
                                maxReasoningEffort: "medium"
                            }
                        }
                    }
                    return undefined
                })() as any, // Type assertion for AWS SDK DocumentType
            })

            const response = await this.client.send(command)

            if (!response.stream) {
                throw new Error('No stream received from Bedrock')
            }

            yield* this.processConverseStream(response.stream, id, timestamp)

        } catch (error: unknown) {
            const err = error as Error & { name?: string }
            yield {
                type: 'error',
                id,
                model: this.model,
                timestamp,
                error: {
                    message: err.message || 'Unknown Bedrock error',
                    code: err.name || 'INTERNAL_ERROR',
                },
            }
        }
    }

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
     * Process ConverseStream events and yield StreamChunks
     */
    private async *processConverseStream(stream: AsyncIterable<any>, id: string, timestamp: number): AsyncIterable<StreamChunk> {
        let accumulatedContent = ''
        let toolCallIndex = -1
        let currentToolUseId = ''
        let lastStopReason: string | undefined
        let lastUsage: any | undefined
        let doneEmitted = false

        // Universal <thinking> tag parsing for any model that emits them
        // (Claude with showThinking, Nova with reasoningConfig or when using tools, etc.)
        let isInsideThinking = false
        let pendingTagBuffer = ''
        let accumulatedThinking = ''

        for await (const event of stream) {
            // Content block delta (text generation)
            if (event.contentBlockDelta) {
                const delta = event.contentBlockDelta.delta

                // Text content
                if (delta?.text) {

                    // Nova: Parse <thinking> tags from text
                    let text = pendingTagBuffer + delta.text
                    pendingTagBuffer = ''

                    while (text.length > 0) {
                        if (!isInsideThinking) {
                            const startIdx = text.indexOf('<thinking>')
                            if (startIdx !== -1) {
                                if (startIdx > 0) {
                                    const before = text.substring(0, startIdx)
                                    accumulatedContent += before
                                    yield { type: 'content', id, model: this.model, timestamp, delta: before, content: accumulatedContent, role: 'assistant' }
                                }
                                isInsideThinking = true
                                text = text.substring(startIdx + 10)
                            } else if (text.includes('<')) {
                                const idx = text.lastIndexOf('<')
                                const before = text.substring(0, idx)
                                if (before) {
                                    accumulatedContent += before
                                    yield { type: 'content', id, model: this.model, timestamp, delta: before, content: accumulatedContent, role: 'assistant' }
                                }
                                pendingTagBuffer = text.substring(idx)
                                break
                            } else {
                                accumulatedContent += text
                                yield { type: 'content', id, model: this.model, timestamp, delta: text, content: accumulatedContent, role: 'assistant' }
                                break
                            }
                        } else {
                            const endIdx = text.indexOf('</thinking>')
                            if (endIdx !== -1) {
                                if (endIdx > 0) {
                                    const thinking = text.substring(0, endIdx)
                                    accumulatedThinking += thinking
                                    yield { type: 'thinking', id, model: this.model, timestamp, delta: thinking, content: accumulatedThinking }
                                }
                                isInsideThinking = false
                                text = text.substring(endIdx + 11)
                            } else if (text.includes('<')) {
                                const idx = text.lastIndexOf('<')
                                const thinking = text.substring(0, idx)
                                if (thinking) {
                                    accumulatedThinking += thinking
                                    yield { type: 'thinking', id, model: this.model, timestamp, delta: thinking, content: accumulatedThinking }
                                }
                                pendingTagBuffer = text.substring(idx)
                                break
                            } else {
                                accumulatedThinking += text
                                yield { type: 'thinking', id, model: this.model, timestamp, delta: text, content: accumulatedThinking }
                                break
                            }
                        }
                    }

                }

                // Tool input (arguments) - comes as partial JSON string chunks
                if (delta?.toolUse?.input) {
                    // Input is already a string, don't JSON.stringify it!
                    const inputDelta = delta.toolUse.input
                    yield {
                        type: 'tool_call',
                        id,
                        model: this.model,
                        timestamp,
                        index: toolCallIndex,
                        toolCall: {
                            id: currentToolUseId,
                            type: 'function',
                            function: {
                                name: '',
                                arguments: inputDelta,
                            }
                        }
                    }
                }
            }

            // Content block start (for tool use)
            if (event.contentBlockStart?.start?.toolUse) {
                toolCallIndex++
                const toolUse = event.contentBlockStart.start.toolUse
                currentToolUseId = toolUse.toolUseId

                yield {
                    type: 'tool_call',
                    id,
                    model: this.model,
                    timestamp,
                    index: toolCallIndex,
                    toolCall: {
                        id: toolUse.toolUseId,
                        type: 'function',
                        function: {
                            name: toolUse.name,
                            arguments: '',
                        }
                    }
                }
            }


            // Message stop (completion)
            if (event.messageStop) {
                lastStopReason = event.messageStop.stopReason
            }

            // Metadata (token usage)
            if (event.metadata?.usage) {
                lastUsage = event.metadata.usage
            }
        }

        // Emit final consolidated done event
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!doneEmitted) {
            yield {
                type: 'done',
                id,
                model: this.model,
                timestamp,
                finishReason: lastStopReason === 'tool_use' ? 'tool_calls' : 'stop',
                usage: lastUsage ? {
                    promptTokens: lastUsage.inputTokens || 0,
                    completionTokens: lastUsage.outputTokens || 0,
                    totalTokens: lastUsage.totalTokens || 0,
                } : undefined
            }
            doneEmitted = true
        }
    }
}
