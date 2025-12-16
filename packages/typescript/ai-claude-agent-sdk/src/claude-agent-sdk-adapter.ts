import { query } from '@anthropic-ai/claude-agent-sdk'
import { BaseAdapter } from '@tanstack/ai'
import { isBuiltinTool } from './builtin-tools'
import { CLAUDE_AGENT_SDK_MODELS } from './model-meta'
import { validateTextProviderOptions } from './text/text-provider-options'
import type { BuiltinToolDefinition } from './builtin-tools'
import type {
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  Options as SdkOptions,
} from '@anthropic-ai/claude-agent-sdk'
import type {
  ChatOptions,
  ContentPart,
  EmbeddingOptions,
  EmbeddingResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
  Tool,
} from '@tanstack/ai'

import type {
  ClaudeAgentSdkDocumentMetadata,
  ClaudeAgentSdkImageMetadata,
  ClaudeAgentSdkMessageMetadataByModality,
} from './message-types'
import type {
  ClaudeAgentSdkChatModelProviderOptionsByName,
  ClaudeAgentSdkModelInputModalitiesByName,
} from './model-meta'
import type {
  ClaudeAgentSdkConfig,
  ClaudeAgentSdkProviderOptions,
  InternalClaudeAgentSdkOptions,
} from './text/text-provider-options'

/**
 * Claude Agent SDK adapter for TanStack AI.
 *
 * Enables Claude Max subscribers to use their subscription for AI development
 * via Claude Code/Agent SDK instead of requiring separate API keys.
 *
 * ## Supported Features
 *
 * - **Basic chat**: Full streaming support ✅
 * - **Built-in tools**: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Task, etc. ✅
 * - **Extended thinking**: Full support with budget_tokens ✅
 * - **Summarization**: Full support ✅
 *
 * ## Known Limitations
 *
 * - **Custom MCP tools**: Currently broken due to Zod 4 incompatibility in the Claude Agent SDK.
 *   The SDK's internal `zodToJsonSchema` function doesn't work with Zod 4.x which TanStack AI uses.
 *   See: https://github.com/anthropics/claude-agent-sdk-typescript/issues/38
 *   **Workaround**: Use the Anthropic adapter (@tanstack/ai-anthropic) for custom tools.
 *
 * - **Embeddings**: Not supported by Claude Agent SDK.
 *
 * @example
 * ```typescript
 * import { claudeAgentSdk, builtinTools } from '@tanstack/ai-claude-agent-sdk';
 * import { chat } from '@tanstack/ai';
 *
 * const adapter = claudeAgentSdk();
 *
 * // Basic chat
 * const result = await chat({
 *   adapter,
 *   model: 'sonnet',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * // With built-in tools (these work!)
 * const resultWithTools = await chat({
 *   adapter,
 *   model: 'sonnet',
 *   messages: [{ role: 'user', content: 'List files in current directory' }],
 *   tools: [builtinTools.Bash, builtinTools.Read, builtinTools.Glob]
 * });
 * ```
 */
export class ClaudeAgentSdk extends BaseAdapter<
  typeof CLAUDE_AGENT_SDK_MODELS,
  [],
  ClaudeAgentSdkProviderOptions,
  Record<string, never>,
  ClaudeAgentSdkChatModelProviderOptionsByName,
  ClaudeAgentSdkModelInputModalitiesByName,
  ClaudeAgentSdkMessageMetadataByModality
> {
  name = 'claude-agent-sdk' as const
  models = CLAUDE_AGENT_SDK_MODELS

  declare _modelProviderOptionsByName: ClaudeAgentSdkChatModelProviderOptionsByName
  declare _modelInputModalitiesByName: ClaudeAgentSdkModelInputModalitiesByName
  declare _messageMetadataByModality: ClaudeAgentSdkMessageMetadataByModality

  private defaultModel?: string

  constructor(config?: ClaudeAgentSdkConfig) {
    super({})
    this.defaultModel = config?.model
  }

  async *chatStream(
    options: ChatOptions<string, ClaudeAgentSdkProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    const model = options.model || this.defaultModel || 'sonnet'

    try {
      // Build the request parameters
      const requestParams = this.mapOptionsToSdk(options)

      // Extract built-in tools and warn about custom tools
      const { builtinToolNames, customToolNames } = this.extractBuiltinTools(options.tools)

      // Warn about custom tools - not supported due to SDK Zod 4 incompatibility
      // See: https://github.com/anthropics/claude-agent-sdk-typescript/issues/38
      if (customToolNames.length > 0) {
        console.warn(
          '[Claude Agent SDK Adapter] Custom tools are not supported due to Zod 4 incompatibility in the SDK. ' +
            'See: https://github.com/anthropics/claude-agent-sdk-typescript/issues/38 ' +
            'Use the Anthropic adapter (@tanstack/ai-anthropic) for custom tools. ' +
            `Ignored tools: ${customToolNames.join(', ')}`,
        )
      }

      // Convert messages to a prompt string for the SDK
      const prompt = this.buildPromptString(options.messages)

      if (!prompt) {
        throw new Error(
          'No user message found. At least one user message is required.',
        )
      }

      // Create abort controller if signal provided
      const abortController = new AbortController()
      if (options.request?.signal) {
        options.request.signal.addEventListener(
          'abort',
          () => {
            abortController.abort()
          },
          { once: true },
        )
      }

      // Build SDK query options
      const sdkOptions: SdkOptions = {
        model,
        maxTurns: requestParams.maxTurns ?? 3,
        // Enable built-in tools by name
        tools: builtinToolNames.length > 0 ? builtinToolNames : [],
        // Explicitly allow built-in tools
        ...(builtinToolNames.length > 0 && { allowedTools: builtinToolNames }),
        abortController,
        // Include partial messages for streaming
        includePartialMessages: true,
        // Extended thinking support
        ...(requestParams.thinking?.type === 'enabled' &&
          requestParams.thinking.budget_tokens && {
            maxThinkingTokens: requestParams.thinking.budget_tokens,
          }),
      }

      // Track accumulated content
      let accumulatedContent = ''
      let accumulatedThinking = ''
      const toolCallsMap = new Map<
        string,
        { id: string; name: string; input: string; index: number }
      >()

      // Stream responses from the SDK
      const stream = query({ prompt, options: sdkOptions })

      for await (const message of stream) {
        // Handle abort signal
        if (options.request?.signal?.aborted) {
          yield {
            type: 'error',
            id: this.generateId(),
            model,
            timestamp,
            error: {
              message: 'Request was aborted',
              code: 'aborted',
            },
          }
          return
        }

        // Handle partial streaming messages
        if (message.type === 'stream_event') {
          const partialMessage = message as unknown as SDKPartialAssistantMessage
          const event = partialMessage.event

          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              const delta = event.delta.text
              accumulatedContent += delta
              yield {
                type: 'content',
                id: this.generateId(),
                model,
                timestamp,
                delta,
                content: accumulatedContent,
                role: 'assistant',
              }
            } else if (event.delta.type === 'thinking_delta') {
              const delta = event.delta.thinking
              accumulatedThinking += delta
              yield {
                type: 'thinking',
                id: this.generateId(),
                model,
                timestamp,
                delta,
                content: accumulatedThinking,
              }
            } else if (event.delta.type === 'input_json_delta') {
              // Tool input streaming - handled when content block stops
            }
          } else if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              const toolId = event.content_block.id
              toolCallsMap.set(toolId, {
                id: toolId,
                name: event.content_block.name,
                input: '',
                index: toolCallsMap.size,
              })
            }
          }
        }

        // Handle complete assistant messages
        if (message.type === 'assistant') {
          const assistantMessage = message as unknown as SDKAssistantMessage
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- SDK types may be looser than what TypeScript infers
          const messageContent = assistantMessage.message?.content

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Runtime guard for SDK response
          if (messageContent) {
            for (const block of messageContent) {
              if (block.type === 'text') {
                // Full text content
                if (!accumulatedContent) {
                  accumulatedContent = block.text
                  yield {
                    type: 'content',
                    id: this.generateId(),
                    model,
                    timestamp,
                    delta: block.text,
                    content: accumulatedContent,
                    role: 'assistant',
                  }
                }
              } else if (block.type === 'thinking') {
                // Thinking content
                if (!accumulatedThinking) {
                  accumulatedThinking = block.thinking
                  yield {
                    type: 'thinking',
                    id: this.generateId(),
                    model,
                    timestamp,
                    delta: block.thinking,
                    content: accumulatedThinking,
                  }
                }
              } else if (block.type === 'tool_use') {
                const toolId = block.id
                const inputStr = JSON.stringify(block.input || {})

                if (!toolCallsMap.has(toolId)) {
                  toolCallsMap.set(toolId, {
                    id: toolId,
                    name: block.name,
                    input: inputStr,
                    index: toolCallsMap.size,
                  })
                }

                const toolCall = toolCallsMap.get(toolId)!
                yield {
                  type: 'tool_call',
                  id: this.generateId(),
                  model,
                  timestamp,
                  toolCall: {
                    id: toolId,
                    type: 'function',
                    function: {
                      name: block.name,
                      arguments: inputStr,
                    },
                  },
                  index: toolCall.index,
                }
              }
            }
          }

          // Handle assistant message errors
          if (assistantMessage.error) {
            yield {
              type: 'error',
              id: this.generateId(),
              model,
              timestamp,
              error: {
                message: `API error: ${assistantMessage.error}`,
                code: assistantMessage.error,
              },
            }
          }
        }

        // Handle result messages
        if (message.type === 'result') {
          const resultMessage = message as unknown as SDKResultMessage

          if (resultMessage.subtype !== 'success') {
            yield {
              type: 'error',
              id: this.generateId(),
              model,
              timestamp,
              error: {
                message: 'errors' in resultMessage
                  ? (resultMessage.errors as Array<string> | undefined)?.join(', ') || 'Unknown error occurred'
                  : 'Unknown error occurred',
                code: resultMessage.subtype,
              },
            }
          }

          const usage = resultMessage.usage as { input_tokens?: number; output_tokens?: number } | undefined
          yield {
            type: 'done',
            id: this.generateId(),
            model,
            timestamp,
            finishReason: toolCallsMap.size > 0 ? 'tool_calls' : 'stop',
            usage: {
              promptTokens: usage?.input_tokens || 0,
              completionTokens: usage?.output_tokens || 0,
              totalTokens:
                (usage?.input_tokens || 0) +
                (usage?.output_tokens || 0),
            },
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { status?: number; code?: string }
      console.error('[Claude Agent SDK Adapter] Error in chatStream:', {
        message: err.message,
        status: err.status,
        code: err.code,
        error: err,
        stack: err.stack,
      })

      // Map error to appropriate code
      const errorCode = this.mapErrorToCode(err)

      yield {
        type: 'error',
        id: this.generateId(),
        model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
          code: errorCode,
        },
      }
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    const chunks: Array<StreamChunk> = []
    for await (const chunk of this.chatStream({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      systemPrompts: [systemPrompt],
      options: { maxTokens: options.maxLength || 500 },
    })) {
      chunks.push(chunk)
    }

    // Extract content from chunks
    let content = ''
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    for (const chunk of chunks) {
      if (chunk.type === 'content') {
        content = chunk.content
      } else if (chunk.type === 'done' && chunk.usage) {
        usage = chunk.usage
      }
    }

    return {
      id: this.generateId(),
      model: options.model,
      summary: content,
      usage,
    }
  }

  createEmbeddings(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    throw new Error(
      'Embeddings are not supported by Claude Agent SDK. Consider using OpenAI or another provider for embeddings.',
    )
  }

  /**
   * Maps common options to SDK format.
   */
  private mapOptionsToSdk(
    options: ChatOptions<string, ClaudeAgentSdkProviderOptions>,
  ): InternalClaudeAgentSdkOptions {
    const providerOptions = options.providerOptions

    // Ensure max_tokens is greater than thinking.budget_tokens if thinking is enabled
    const thinkingBudget =
      providerOptions?.thinking?.type === 'enabled'
        ? providerOptions.thinking.budget_tokens
        : undefined
    const defaultMaxTokens = options.options?.maxTokens || 1024
    const maxTokens =
      thinkingBudget && thinkingBudget >= defaultMaxTokens
        ? thinkingBudget + 1
        : defaultMaxTokens

    const requestParams: InternalClaudeAgentSdkOptions = {
      model: options.model,
      max_tokens: maxTokens,
      temperature: options.options?.temperature,
      top_p: options.options?.topP,
      system: options.systemPrompts?.join('\n'),
      thinking: providerOptions?.thinking,
      stop_sequences: providerOptions?.stop_sequences,
      top_k: providerOptions?.top_k,
      maxTurns: providerOptions?.maxTurns,
    }

    validateTextProviderOptions(requestParams)
    return requestParams
  }

  /**
   * Converts a content part to text representation.
   * For multimodal content, this returns text descriptions as the SDK
   * handles images differently through file paths.
   */
  private convertContentPartToText(part: ContentPart): string {
    switch (part.type) {
      case 'text':
        return part.content
      case 'image': {
        const metadata = part.metadata as ClaudeAgentSdkImageMetadata | undefined
        const mediaType = metadata?.mediaType || 'image/jpeg'
        if (part.source.type === 'data') {
          return `[Image: base64 ${mediaType}]`
        } else {
          return `[Image: ${part.source.value}]`
        }
      }
      case 'document': {
        const metadata = part.metadata as ClaudeAgentSdkDocumentMetadata | undefined
        const title = metadata?.title || 'Document'
        if (part.source.type === 'data') {
          return `[Document: ${title} (base64 PDF)]`
        } else {
          return `[Document: ${title} - ${part.source.value}]`
        }
      }
      case 'audio':
      case 'video':
        throw new Error(
          `Claude Agent SDK does not support ${part.type} content directly`,
        )
      default: {
        const _exhaustiveCheck: never = part
        throw new Error(
          `Unsupported content part type: ${(_exhaustiveCheck as ContentPart).type}`,
        )
      }
    }
  }

  /**
   * Maps SDK errors to TanStack AI error codes.
   */
  private mapErrorToCode(error: Error & { status?: number; code?: string; type?: string }): string {
    if (error.code) {
      // Map known error codes
      switch (error.code) {
        case 'authentication_error':
        case 'invalid_api_key':
          return 'auth_error'
        case 'rate_limit_error':
          return 'rate_limit'
        case 'context_length_exceeded':
          return 'context_window_exceeded'
        default:
          return error.code
      }
    }

    if (error.status) {
      switch (error.status) {
        case 401:
          return 'auth_error'
        case 429:
          return 'rate_limit'
        case 413:
          return 'context_window_exceeded'
        default:
          return `http_${error.status}`
      }
    }

    return 'unknown_error'
  }

  /**
   * Builds a summarization system prompt.
   */
  private buildSummarizationPrompt(options: SummarizationOptions): string {
    let prompt = 'You are a professional summarizer. '

    switch (options.style) {
      case 'bullet-points':
        prompt += 'Provide a summary in bullet point format. '
        break
      case 'paragraph':
        prompt += 'Provide a summary in paragraph format. '
        break
      case 'concise':
        prompt += 'Provide a very concise summary in 1-2 sentences. '
        break
      default:
        prompt += 'Provide a clear and concise summary. '
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(', ')}. `
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `
    }

    return prompt
  }

  /**
   * Extracts built-in Claude Code tool names from the tools array.
   * Custom tools are not supported due to Zod 4 incompatibility in the SDK.
   * See: https://github.com/anthropics/claude-agent-sdk-typescript/issues/38
   */
  private extractBuiltinTools(tools?: Array<Tool<any, any, any> | BuiltinToolDefinition>): {
    builtinToolNames: Array<string>
    customToolNames: Array<string>
  } {
    if (!tools || tools.length === 0) {
      return { builtinToolNames: [], customToolNames: [] }
    }

    const builtinToolNames: Array<string> = []
    const customToolNames: Array<string> = []

    for (const tool of tools) {
      if (isBuiltinTool(tool)) {
        builtinToolNames.push(tool.name)
      } else {
        customToolNames.push((tool as Tool).name)
      }
    }

    return { builtinToolNames, customToolNames }
  }

  /**
   * Builds a prompt string from messages for the SDK.
   * Extracts text content from the last user message.
   */
  private buildPromptString(messages: Array<ModelMessage>): string {
    // Find the last user message by iterating in reverse
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]
      if (message?.role === 'user') {
        if (typeof message.content === 'string') {
          return message.content
        } else if (message.content && message.content.length > 0) {
          return message.content
            .map((part) => this.convertContentPartToText(part))
            .join('\n')
        }
      }
    }
    return ''
  }

}

/**
 * Creates a Claude Agent SDK adapter instance.
 *
 * @param config - Optional configuration
 * @returns Configured adapter instance
 *
 * @example
 * ```typescript
 * import { createClaudeAgentSdk } from '@tanstack/ai-claude-agent-sdk';
 *
 * const adapter = createClaudeAgentSdk();
 *
 * // Use with TanStack AI
 * const result = await chat({
 *   adapter,
 *   model: 'sonnet',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export function createClaudeAgentSdk(
  config?: ClaudeAgentSdkConfig,
): ClaudeAgentSdk {
  return new ClaudeAgentSdk(config)
}

/**
 * Create a Claude Agent SDK adapter with default configuration.
 *
 * Authentication is handled automatically by the Claude Agent SDK:
 * - For Claude Max subscribers: Uses Claude Code runtime authentication
 * - For API users: Uses ANTHROPIC_API_KEY from environment
 * - For Bedrock: Set CLAUDE_CODE_USE_BEDROCK=1 + AWS credentials
 * - For Vertex AI: Set CLAUDE_CODE_USE_VERTEX=1 + Google Cloud credentials
 *
 * @param config - Optional configuration (model override)
 * @returns Configured Claude Agent SDK adapter instance
 *
 * @example
 * ```typescript
 * import { claudeAgentSdk } from '@tanstack/ai-claude-agent-sdk';
 *
 * // Automatically uses Claude Max subscription or ANTHROPIC_API_KEY from environment
 * const adapter = claudeAgentSdk();
 * ```
 */
export function claudeAgentSdk(config?: ClaudeAgentSdkConfig): ClaudeAgentSdk {
  return createClaudeAgentSdk(config)
}

export type { ClaudeAgentSdkConfig }
