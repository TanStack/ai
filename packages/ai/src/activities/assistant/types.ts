// packages/ai/src/activities/assistant/types.ts
import type { Context as AGUIContext } from '@ag-ui/core'
import type {
  AudioGenerationResult,
  ChatStream,
  ImageGenerationResult,
  JSONSchema,
  ModelMessage,
  StreamChunk,
  StructuredOutputStream,
  SummarizationResult,
  TTSResult,
  TranscriptionResult,
  UIMessage,
  VideoJobResult,
} from '../../types.js'

/** The parsed request handed to the `chat` capability callback. */
export interface AssistantChatRequest {
  messages: Array<UIMessage | ModelMessage>
  threadId: string
  runId: string
  parentRunId?: string
  /** Client-declared tools (name/description/JSON-schema) from the AG-UI body. */
  tools: Array<{ name: string; description: string; parameters: JSONSchema }>
  forwardedProps: Record<string, unknown>
  state: unknown
  aguiContext: Array<AGUIContext>
  /** Raw request, for escape hatches (headers, auth). */
  request: Request
}

/** Base for one-shot capability requests: parsed generation input + raw request. */
interface AssistantOneShotBase {
  threadId: string
  runId: string
  parentRunId?: string
  state: unknown
  aguiContext: Array<AGUIContext>
  forwardedProps: Record<string, unknown>
  request: Request
}

export interface AssistantImageRequest extends AssistantOneShotBase {
  prompt: unknown
  numberOfImages?: number
  size?: unknown
  modelOptions?: Record<string, unknown>
}
export interface AssistantAudioRequest extends AssistantOneShotBase {
  prompt: unknown
  duration?: number
  modelOptions?: Record<string, unknown>
}
export interface AssistantSpeechRequest extends AssistantOneShotBase {
  text: string
  voice?: string
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  speed?: number
  modelOptions?: Record<string, unknown>
}
export interface AssistantVideoRequest extends AssistantOneShotBase {
  prompt: unknown
  size?: unknown
  duration?: unknown
  modelOptions?: Record<string, unknown>
}
export interface AssistantTranscriptionRequest extends AssistantOneShotBase {
  audio: string | File | Blob | ArrayBuffer
  language?: string
  prompt?: string
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  modelOptions?: Record<string, unknown>
}
export interface AssistantSummarizeRequest extends AssistantOneShotBase {
  text: string
  maxLength?: number
  style?: 'bullet-points' | 'paragraph' | 'concise'
  focus?: Array<string>
  modelOptions?: Record<string, unknown>
}

/** A capability callback returns either a stream or a promise of the activity result. */
type MaybeStream<TResult> = AsyncIterable<StreamChunk> | Promise<TResult>

/** The shape a user passes to `defineAssistant`. Every key optional. */
export interface AssistantConfig {
  chat?: (
    req: AssistantChatRequest,
  ) =>
    | ChatStream
    | StructuredOutputStream<any>
    | Promise<string>
    | Promise<object>
  image?: (req: AssistantImageRequest) => MaybeStream<ImageGenerationResult>
  audio?: (req: AssistantAudioRequest) => MaybeStream<AudioGenerationResult>
  speech?: (req: AssistantSpeechRequest) => MaybeStream<TTSResult>
  video?: (req: AssistantVideoRequest) => MaybeStream<VideoJobResult>
  transcription?: (
    req: AssistantTranscriptionRequest,
  ) => MaybeStream<TranscriptionResult>
  summarize?: (
    req: AssistantSummarizeRequest,
  ) => MaybeStream<SummarizationResult>
}

export type AssistantCapabilityName = keyof AssistantConfig

export interface AssistantDefinition<
  T extends AssistantConfig = AssistantConfig,
> {
  /** The declared capability names (for the client to enumerate). */
  readonly capabilities: ReadonlyArray<keyof T & string>
  /** Single request handler; routes by the `capability` discriminator. */
  handler: (request: Request) => Promise<Response>
  /** Type-only carrier of the config for client inference. Never read at runtime. */
  readonly '~caps': T
}
