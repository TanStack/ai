import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chat } from '@tanstack/ai'
import { createGrokText } from '../src/adapters/text'
import type { GrokChatModel } from '../src/model-meta'
import type { GrokMessageMetadataByModality } from '../src/message-types'
import type {
  ConstrainedModelMessage,
  RunFinishedEvent,
  StreamChunk,
  TextMessageContentEvent,
  Tool,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from '@tanstack/ai'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function loadApiKey(): string {
  try {
    const envContent = readFileSync(join(__dirname, '.env.local'), 'utf-8')
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match) {
        process.env[match[1]!.trim()] = match[2]!.trim()
      }
    })
  } catch {
    // .env.local not found, will use process.env
  }

  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    console.error(
      'XAI_API_KEY not found. Create a .env.local file or set it in your environment.',
    )
    process.exit(1)
  }
  return apiKey
}

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
}

export function resolveModel(): GrokChatModel {
  return parseModels(process.argv.slice(2))[0] ?? 'grok-4.3'
}

export function createLiveTestAdapter(model: GrokChatModel, apiKey: string) {
  return createGrokText(model, apiKey)
}

function isGrokChatModel(model: string): model is GrokChatModel {
  return ['grok-4.2', 'grok-4-2-non-reasoning', 'grok-4.3'].includes(
    model,
  )
}

export function parseModels(args: Array<string>): Array<GrokChatModel> {
  const modelFlagIndex = args.indexOf('--model')
  if (modelFlagIndex >= 0) {
    const model = args[modelFlagIndex + 1]
    if (!model) {
      throw new Error('--model requires a value')
    }
    if (!isGrokChatModel(model)) {
      throw new Error(`Unknown Grok chat model: ${model}`)
    }
    return [model]
  }

  const modelsFlagIndex = args.indexOf('--models')
  if (modelsFlagIndex >= 0) {
    const raw = args[modelsFlagIndex + 1]
    if (!raw) {
      throw new Error('--models requires a comma-separated value')
    }
    return raw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
      .map((model) => {
        if (!isGrokChatModel(model)) {
          throw new Error(`Unknown Grok chat model: ${model}`)
        }
        return model
      })
  }

  return ['grok-4.3']
}

export function supportsClientToolCalling(_model: string): boolean {
  return true
}

export function supportsBuiltInServerTools(_model: string): boolean {
  return true
}

type GrokLiveTestMessage = ConstrainedModelMessage<{
  inputModalities: readonly ['text', 'image']
  messageMetadataByModality: GrokMessageMetadataByModality
}>

export function streamChat(options: {
  model: GrokChatModel
  apiKey: string
  messages: Array<GrokLiveTestMessage>
  tools?: Array<Tool>
  maxTokens?: number
  modelOptions?: Parameters<typeof chat>[0]['modelOptions']
}): AsyncIterable<StreamChunk> {
  return chat({
    adapter: createLiveTestAdapter(options.model, options.apiKey),
    messages: options.messages,
    tools: options.tools,
    maxTokens: options.maxTokens,
    modelOptions: options.modelOptions,
    stream: true,
  }) as unknown as AsyncIterable<StreamChunk>
}

export function textFromChunks(chunks: Array<StreamChunk>): string {
  return chunks
    .filter((chunk): chunk is TextMessageContentEvent =>
      chunk.type === 'TEXT_MESSAGE_CONTENT'
    )
    .map((chunk) => chunk.delta)
    .join('')
}

export function findRunFinished(
  chunks: Array<StreamChunk>,
): RunFinishedEvent | undefined {
  return chunks.find(
    (chunk): chunk is RunFinishedEvent => chunk.type === 'RUN_FINISHED',
  )
}

export function findToolCallStart(
  chunks: Array<StreamChunk>,
): ToolCallStartEvent | undefined {
  return chunks.find(
    (chunk): chunk is ToolCallStartEvent => chunk.type === 'TOOL_CALL_START',
  )
}

export function findToolCallEnd(
  chunks: Array<StreamChunk>,
): ToolCallEndEvent | undefined {
  return chunks.find(
    (chunk): chunk is ToolCallEndEvent => chunk.type === 'TOOL_CALL_END',
  )
}
