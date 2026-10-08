import {
  transformMessagesForReplay,
  hashToolCallId,
  sanitizeUnicode,
  sanitizeJsonArguments,
  orderedAssistantBlocks,
} from '@tanstack/ai/adapter-internals'
import {
  isFileSource,
  normalizeSystemPrompts,
  unsupportedFileSourceError,
} from '@tanstack/ai'
import type {
  ContentPart,
  ContentPartDataSource,
  DocumentPart,
  ImagePart,
  ModelMessage,
  Modality,
  SystemPrompt,
  TextPart,
} from '@tanstack/ai'
import type {
  ContentBlock,
  Message,
  SystemContentBlock,
  ToolResultContentBlock,
} from '@aws-sdk/client-bedrock-runtime'
import type { DocumentType } from '@smithy/types'
import type {
  BedrockSystemPromptMetadata,
  BedrockTextMetadata,
} from '../message-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

function imageFormat(mime: string): 'png' | 'jpeg' | 'gif' | 'webp' {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpeg'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    default:
      throw new Error(
        `Bedrock Converse: unsupported image MIME type "${mime}". Supported types: image/png, image/jpeg, image/gif, image/webp.`,
      )
  }
}

function documentFormat(
  mime: string,
): 'pdf' | 'csv' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'html' | 'txt' | 'md' {
  switch (mime) {
    case 'application/pdf':
      return 'pdf'
    case 'text/csv':
      return 'csv'
    case 'application/msword':
      return 'doc'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'docx'
    case 'application/vnd.ms-excel':
      return 'xls'
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      return 'xlsx'
    case 'text/html':
      return 'html'
    case 'text/plain':
      return 'txt'
    case 'text/markdown':
    case 'text/x-markdown':
      return 'md'
    default:
      throw new Error(
        `Bedrock Converse: unsupported document MIME type "${mime}". Supported types: pdf, csv, doc, docx, xls, xlsx, html, txt, md.`,
      )
  }
}

function stringContent(
  content: string | null | undefined | Array<ContentPart>,
): string {
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  return content
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.content)
    .join('')
}

function isTextPart(p: ContentPart): p is TextPart {
  return p.type === 'text'
}

function isImagePart(p: ContentPart): p is ImagePart {
  return p.type === 'image'
}

function isDocumentPart(p: ContentPart): p is DocumentPart {
  return p.type === 'document'
}

function isDataSource(
  source: ImagePart['source'] | DocumentPart['source'],
): source is ContentPartDataSource {
  return source.type === 'data'
}

function contentPartToBlock(part: ContentPart, docIndex: number): ContentBlock {
  if (isTextPart(part)) {
    return { text: sanitizeUnicode(part.content) }
  }

  if (isImagePart(part)) {
    const { source } = part
    if (isFileSource(source)) throw unsupportedFileSourceError('bedrock')
    if (!isDataSource(source)) {
      throw new Error(
        'Bedrock Converse requires inline image bytes; URL image sources are not supported.',
      )
    }
    return {
      image: {
        format: imageFormat(source.mimeType),
        source: { bytes: base64ToBytes(source.value) },
      },
    }
  }

  if (isDocumentPart(part)) {
    const { source } = part
    if (isFileSource(source)) throw unsupportedFileSourceError('bedrock')
    if (!isDataSource(source)) {
      throw new Error(
        'Bedrock Converse requires inline document bytes; URL document sources are not supported.',
      )
    }
    return {
      document: {
        format: documentFormat(source.mimeType),
        name: `document-${docIndex}`,
        source: { bytes: base64ToBytes(source.value) },
      },
    }
  }

  // Fail loud for unsupported part types (audio, video, etc.)
  throw new Error(
    `Bedrock Converse does not support content part type "${String(part.type)}".`,
  )
}

interface ConverseReplayContext {
  model: string
  provider?: string
  inputModalities: ReadonlyArray<Modality>
}

function messageToBlocks(
  msg: ModelMessage,
  docCounter: { value: number },
  context?: ConverseReplayContext,
): Array<ContentBlock> {
  const blocks: Array<ContentBlock> = []
  if (msg.role === 'tool') {
    if (!msg.toolCallId)
      throw new Error('Bedrock Converse: tool message is missing toolCallId.')
    const content: Array<ToolResultContentBlock> = []
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text')
          content.push({ text: sanitizeUnicode(part.content) })
        else if (part.type === 'image') {
          if (context && !context.inputModalities.includes('image')) {
            content.push({
              text: '(image omitted: model does not support images)',
            })
          } else {
            const block = contentPartToBlock(part, 0)
            if ('image' in block && block.image)
              content.push({ image: block.image })
          }
        }
      }
    } else content.push({ text: sanitizeUnicode(stringContent(msg.content)) })
    if (content.length === 0) content.push({ text: '(empty tool result)' })
    return [
      {
        toolResult: {
          toolUseId: msg.toolCallId,
          content,
          status: msg.error !== undefined ? 'error' : 'success',
        },
      },
    ]
  }

  function appendThinking(
    thinking: NonNullable<ModelMessage['thinking']>[number],
  ): void {
    if (thinking.redacted) {
      if (thinking.signature)
        blocks.push({
          reasoningContent: {
            redactedContent: base64ToBytes(thinking.signature),
          },
        })
      return
    }
    const text = sanitizeUnicode(thinking.content)
    if (!text) return
    const claude = /anthropic[./]claude/i.test(context?.model ?? '')
    if (claude && !thinking.signature) blocks.push({ text })
    else
      blocks.push({
        reasoningContent: {
          reasoningText: {
            text,
            ...(claude && thinking.signature
              ? { signature: thinking.signature }
              : {}),
          },
        },
      })
  }
  function appendTool(
    call: NonNullable<ModelMessage['toolCalls']>[number],
  ): void {
    const rawArguments = sanitizeJsonArguments(call.function.arguments)
    let parsed: DocumentType
    try {
      parsed = JSON.parse(rawArguments)
    } catch (error: unknown) {
      throw new Error(
        'Bedrock Converse: tool call "' +
          call.function.name +
          '" has malformed JSON arguments (' +
          String(error) +
          '). Raw: ' +
          rawArguments,
      )
    }
    blocks.push({
      toolUse: { toolUseId: call.id, name: call.function.name, input: parsed },
    })
  }
  const ordered =
    msg.role === 'assistant' ? orderedAssistantBlocks(msg) : undefined
  if (ordered) {
    for (const block of ordered) {
      if (block.type === 'thinking') appendThinking(block.thinking)
      else if (block.type === 'tool-call') appendTool(block.toolCall)
      else blocks.push({ text: sanitizeUnicode(block.text) })
    }
    return blocks
  }
  if (msg.role === 'assistant')
    for (const thinking of msg.thinking ?? []) appendThinking(thinking)
  if (typeof msg.content === 'string') {
    if (msg.content !== '') blocks.push({ text: sanitizeUnicode(msg.content) })
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      blocks.push(
        contentPartToBlock(part, isDocumentPart(part) ? ++docCounter.value : 0),
      )
      if (isTextPart(part)) {
        const { cachePoint } = (part.metadata ?? {}) as BedrockTextMetadata
        if (cachePoint) blocks.push({ cachePoint })
      }
    }
  }
  if (msg.role === 'assistant')
    for (const call of msg.toolCalls ?? []) appendTool(call)
  return blocks
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert TanStack AI messages + system prompts into the Converse API format.
 *
 * - System prompts are lifted into `SystemContentBlock[]`; a prompt whose
 *   `metadata.cachePoint` is set is followed by a `cachePoint` block.
 * - `tool` role messages are remapped to `user` role `toolResult` blocks.
 * - Consecutive messages with the same Converse role are merged (Converse
 *   requires strict user/assistant alternation).
 */
export function toConverseMessages(
  messages: Array<ModelMessage>,
  systemPrompts?: Array<SystemPrompt>,
  context?: ConverseReplayContext,
): { system: Array<SystemContentBlock>; messages: Array<Message> } {
  // Build system blocks (uses normalizeSystemPrompts for runtime validation)
  const system: Array<SystemContentBlock> =
    normalizeSystemPrompts<BedrockSystemPromptMetadata>(systemPrompts).flatMap(
      (p) =>
        p.metadata?.cachePoint
          ? [
              { text: sanitizeUnicode(p.content) },
              { cachePoint: p.metadata.cachePoint },
            ]
          : [{ text: sanitizeUnicode(p.content) }],
    )

  // Convert each ModelMessage to a Converse Message, merging same-role pairs
  const converseMessages: Array<Message> = []
  // Global document counter: ensures every document block across all messages
  // gets a unique name, preventing Bedrock ValidationException for duplicate names.
  const docCounter = { value: 0 }

  const replay = transformMessagesForReplay(
    messages,
    context
      ? {
          provider: context.provider ?? 'amazon-bedrock',
          api: 'bedrock-converse-stream',
          model: context.model,
        }
      : undefined,
    (id, { foreign, attempt }) => {
      if (!foreign && attempt === 0) return id
      const clean = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
      return attempt === 0
        ? clean
        : clean.slice(0, 47) +
            '_' +
            hashToolCallId(id + ':' + attempt).slice(0, 16)
    },
  )
  for (const msg of replay.messages) {
    // Map TanStack roles to Converse roles
    const converseRole: 'user' | 'assistant' =
      msg.role === 'assistant' ? 'assistant' : 'user'

    const blocks = messageToBlocks(msg, docCounter, context)

    // Skip messages that produce no content blocks (e.g. assistant with
    // null content and no toolCalls). Pushing an empty-content message to
    // Converse triggers a ValidationException.
    if (blocks.length === 0) continue

    const last = converseMessages[converseMessages.length - 1]
    if (last && last.role === converseRole) {
      // Merge into the previous message's content array
      last.content = [...(last.content ?? []), ...blocks]
    } else {
      converseMessages.push({ role: converseRole, content: blocks })
    }
  }

  return { system, messages: converseMessages }
}

/**
 * Write the `toolUse` and `toolResult` blocks as text blocks. Bedrock rejects
 * these blocks in a request with no `toolConfig`, so a request with no tools
 * sends its tool history this way. An image of a tool result stays an image
 * block: the result is in a user message, and a user message takes images.
 * The function returns new messages and does not change `messages`.
 */
export function toolBlocksToText(messages: Array<Message>): Array<Message> {
  const toolNames = new Map<string | undefined, string | undefined>()
  return messages.map((message) => ({
    ...message,
    content: message.content?.flatMap((block): Array<ContentBlock> => {
      if (block.toolUse) {
        const { toolUseId, name, input } = block.toolUse
        toolNames.set(toolUseId, name)
        return [{ text: `[Tool call ${name}(${JSON.stringify(input ?? {})})]` }]
      }
      if (!block.toolResult) return [block]
      const { toolUseId, content = [] } = block.toolResult
      const text = content.map((part) => part.text ?? '').join('')
      return [
        {
          text: `[Tool result for ${toolNames.get(toolUseId) ?? toolUseId}: ${text}]`,
        },
        ...content.flatMap((part) =>
          part.image ? [{ image: part.image }] : [],
        ),
      ]
    }),
  }))
}
