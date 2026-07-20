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

function stringContent(content: string | null | Array<ContentPart>): string {
  if (content === null) return ''
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
    return { text: part.content }
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

function messageToBlocks(
  msg: ModelMessage,
  docCounter: { value: number },
): Array<ContentBlock> {
  const blocks: Array<ContentBlock> = []

  if (msg.role === 'tool') {
    if (!msg.toolCallId) {
      throw new Error(
        'Bedrock Converse: tool message is missing toolCallId. Every tool result must reference the tool use ID it is responding to.',
      )
    }
    const textContent = stringContent(msg.content)
    const toolResult: ToolResultContentBlock = { text: textContent }
    blocks.push({
      toolResult: {
        toolUseId: msg.toolCallId,
        content: [toolResult],
        status: 'success',
      },
    })
    return blocks
  }

  // Map content field to text/image/document blocks
  if (typeof msg.content === 'string') {
    if (msg.content !== '') {
      blocks.push({ text: msg.content })
    }
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      const docIndex = isDocumentPart(part) ? ++docCounter.value : 0
      blocks.push(contentPartToBlock(part, docIndex))
    }
  }
  // null → no text blocks

  // Append toolUse blocks for assistant tool calls. Malformed or non-object
  // arguments come from a prior assistant turn the engine already accepted, so
  // they signal a real upstream problem — throw rather than silently coercing to
  // `{}` and forwarding a corrupted tool call (the adapter's catch surfaces it
  // as a RUN_ERROR).
  if (msg.role === 'assistant' && msg.toolCalls) {
    for (const call of msg.toolCalls) {
      const rawArguments = call.function.arguments || '{}'
      let parsed: unknown
      try {
        parsed = JSON.parse(rawArguments)
      } catch (error: unknown) {
        throw new Error(
          `Bedrock Converse: tool call "${call.function.name}" has malformed JSON arguments (${String(error)}). Raw: ${rawArguments}`,
        )
      }
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          `Bedrock Converse: tool call "${call.function.name}" arguments must be a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}.`,
        )
      }
      blocks.push({
        toolUse: {
          toolUseId: call.id,
          name: call.function.name,
          input: parsed as DocumentType,
        },
      })
    }
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert TanStack AI messages + system prompts into the Converse API format.
 *
 * - System prompts are lifted into `SystemContentBlock[]`.
 * - `tool` role messages are remapped to `user` role `toolResult` blocks.
 * - Consecutive messages with the same Converse role are merged (Converse
 *   requires strict user/assistant alternation).
 */
export function toConverseMessages(
  messages: Array<ModelMessage>,
  systemPrompts?: Array<SystemPrompt>,
): { system: Array<SystemContentBlock>; messages: Array<Message> } {
  // Build system blocks (uses normalizeSystemPrompts for runtime validation)
  const system: Array<SystemContentBlock> = normalizeSystemPrompts(
    systemPrompts,
  ).map((p) => ({ text: p.content }))

  // Convert each ModelMessage to a Converse Message, merging same-role pairs
  const converseMessages: Array<Message> = []
  // Global document counter: ensures every document block across all messages
  // gets a unique name, preventing Bedrock ValidationException for duplicate names.
  const docCounter = { value: 0 }

  for (const msg of messages) {
    // Map TanStack roles to Converse roles
    const converseRole: 'user' | 'assistant' =
      msg.role === 'assistant' ? 'assistant' : 'user'

    const blocks = messageToBlocks(msg, docCounter)

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
