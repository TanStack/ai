import type { OpenAI } from 'openai'
import type { AzureClientOptions } from 'openai/azure'
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from 'openai/resources/chat/completions/completions'
import type {
  CompactedResponse,
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import type {
  CreateEmbeddingResponse,
  Embedding,
} from 'openai/resources/embeddings'
import type {
  ImageEditStreamEvent,
  ImageGenStreamEvent,
  ImagesResponse,
} from 'openai/resources/images'
import type {
  Transcription,
  TranscriptionCreateResponse,
  TranscriptionStreamEvent,
  TranscriptionVerbose,
} from 'openai/resources/audio/transcriptions'
import type {
  FileCreateParams,
  FileDeleted,
  FileObject,
} from 'openai/resources/files'
import type { Video, VideoDownloadContentParams } from 'openai/resources/videos'
import type { Decision, DecisionCreateParams } from 'openai/resources/decisions'
import type {
  AudioResponseFormatKey,
  OpenaiPostAudioSpeechBody,
  OpenaiPostAudioTranscriptionsBody,
  OpenaiPostChatCompletionsBody,
  OpenaiPostEmbeddingsBody,
  OpenaiPostImagesEditsBody,
  OpenaiPostImagesGenerationsBody,
  OpenaiPostResponsesBody,
  OpenaiPostResponsesCompactBody,
  OpenaiPostVideosBody,
} from '../generated/client/types'

/**
 * Request bodies are the generated modelschemas types, so every call the
 * adapters build is checked against the OpenAI document. Results are still
 * the SDK types.
 */
type ChatBody = OpenaiPostChatCompletionsBody
type ResponsesBody = OpenaiPostResponsesBody
type TranscriptionBody<Format = AudioResponseFormatKey | undefined> = Omit<
  OpenaiPostAudioTranscriptionsBody,
  'response_format'
> & { response_format?: Format }
type NonStreaming<Body> = Body & { stream?: false | null }
type Streaming<Body> = Body & { stream: true }

/** The SDK result of `embeddings.create` with `encoding_format: 'base64'`. */
export type Base64EmbeddingResponse = Omit<CreateEmbeddingResponse, 'data'> & {
  data: Array<Omit<Embedding, 'embedding'> & { embedding: string }>
}

/** The per-request options of the OpenAI SDK (second argument of each call). */
export type RequestOptions = NonNullable<
  Parameters<OpenAI['files']['retrieve']>[1]
>

/**
 * The part of the OpenAI SDK client that TanStack AI adapters call. The
 * method names and results match the SDK. The request bodies are the
 * generated modelschemas types, so a real `new OpenAI()` (or `AzureOpenAI`)
 * does not fit this type: use `createOpenAIClient()`. A stream is an
 * `AsyncIterable` of the SDK event type.
 *
 * The call signatures copy the SDK overloads, so a call with `stream: true`
 * gives a stream type and a call without it gives the response type.
 */
export interface OpenAIClientLike {
  /** The base URL of the API. */
  readonly baseURL: string
  readonly chat: {
    readonly completions: {
      readonly create: {
        (
          body: NonStreaming<ChatBody>,
          options?: RequestOptions,
        ): Promise<ChatCompletion>
        (
          body: Streaming<ChatBody>,
          options?: RequestOptions,
        ): Promise<AsyncIterable<ChatCompletionChunk>>
        (
          body: ChatBody,
          options?: RequestOptions,
        ): Promise<AsyncIterable<ChatCompletionChunk> | ChatCompletion>
      }
    }
  }
  readonly responses: {
    readonly create: {
      (
        body: NonStreaming<ResponsesBody>,
        options?: RequestOptions,
      ): Promise<OpenAIResponse>
      (
        body: Streaming<ResponsesBody>,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ResponseStreamEvent>>
      (
        body: ResponsesBody,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ResponseStreamEvent> | OpenAIResponse>
    }
    readonly compact: (
      body: OpenaiPostResponsesCompactBody,
      options?: RequestOptions,
    ) => Promise<CompactedResponse>
  }
  readonly embeddings: {
    readonly create: {
      (
        body: OpenaiPostEmbeddingsBody & { encoding_format: 'base64' },
        options?: RequestOptions,
      ): Promise<Base64EmbeddingResponse>
      (
        body: OpenaiPostEmbeddingsBody,
        options?: RequestOptions,
      ): Promise<CreateEmbeddingResponse>
    }
  }
  readonly images: {
    readonly generate: {
      (
        body: NonStreaming<OpenaiPostImagesGenerationsBody>,
        options?: RequestOptions,
      ): Promise<ImagesResponse>
      (
        body: Streaming<OpenaiPostImagesGenerationsBody>,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageGenStreamEvent>>
      (
        body: OpenaiPostImagesGenerationsBody,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageGenStreamEvent> | ImagesResponse>
    }
    readonly edit: {
      (
        body: NonStreaming<OpenaiPostImagesEditsBody>,
        options?: RequestOptions,
      ): Promise<ImagesResponse>
      (
        body: Streaming<OpenaiPostImagesEditsBody>,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageEditStreamEvent>>
      (
        body: OpenaiPostImagesEditsBody,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageEditStreamEvent> | ImagesResponse>
    }
  }
  readonly audio: {
    readonly speech: {
      /** Resolves to the raw `Response`. Read it with `.arrayBuffer()`. */
      readonly create: (
        body: OpenaiPostAudioSpeechBody,
        options?: RequestOptions,
      ) => Promise<Response>
    }
    readonly transcriptions: {
      readonly create: {
        (
          body: NonStreaming<TranscriptionBody<'json' | undefined>>,
          options?: RequestOptions,
        ): Promise<Transcription>
        (
          body: NonStreaming<TranscriptionBody<'verbose_json'>>,
          options?: RequestOptions,
        ): Promise<TranscriptionVerbose>
        (
          body: NonStreaming<TranscriptionBody<'srt' | 'vtt' | 'text'>>,
          options?: RequestOptions,
        ): Promise<string>
        (
          body: NonStreaming<TranscriptionBody>,
          options?: RequestOptions,
        ): Promise<Transcription>
        (
          body: Streaming<TranscriptionBody>,
          options?: RequestOptions,
        ): Promise<AsyncIterable<TranscriptionStreamEvent>>
        (
          body: Streaming<TranscriptionBody>,
          options?: RequestOptions,
        ): Promise<
          | TranscriptionCreateResponse
          | string
          | AsyncIterable<TranscriptionStreamEvent>
        >
      }
    }
  }
  readonly files: {
    readonly create: (
      body: FileCreateParams,
      options?: RequestOptions,
    ) => Promise<FileObject>
    readonly retrieve: (
      fileID: string,
      options?: RequestOptions,
    ) => Promise<FileObject>
    readonly delete: (
      fileID: string,
      options?: RequestOptions,
    ) => Promise<FileDeleted>
  }
  readonly videos: {
    readonly create: (
      body: OpenaiPostVideosBody,
      options?: RequestOptions,
    ) => Promise<Video>
    readonly retrieve: (
      videoID: string,
      options?: RequestOptions,
    ) => Promise<Video>
    /** Resolves to the raw `Response` of the video bytes. */
    readonly downloadContent: (
      videoID: string,
      query?: VideoDownloadContentParams | null,
      options?: RequestOptions,
    ) => Promise<Response>
  }
  readonly decisions: {
    readonly create: (
      body: DecisionCreateParams,
      options?: RequestOptions,
    ) => Promise<Decision>
  }
  /**
   * Sends `POST path` with `options.body` as JSON and resolves to the parsed
   * body.
   */
  readonly post: <T>(path: string, options?: RequestOptions) => Promise<T>
  /**
   * A new client with the same options plus `options`. The type is the
   * options that both `OpenAI` and `AzureOpenAI` accept.
   */
  readonly withOptions: (
    options: Partial<AzureClientOptions>,
  ) => OpenAIClientLike
}
