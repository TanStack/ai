import type { OpenAI } from 'openai'
import type { AzureClientOptions } from 'openai/azure'
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions/completions'
import type {
  CompactedResponse,
  Response as OpenAIResponse,
  ResponseCompactParams,
  ResponseCreateParamsBase,
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import type {
  CreateEmbeddingResponse,
  Embedding,
  EmbeddingCreateParams,
} from 'openai/resources/embeddings'
import type {
  ImageEditParamsBase,
  ImageEditParamsNonStreaming,
  ImageEditParamsStreaming,
  ImageEditStreamEvent,
  ImageGenStreamEvent,
  ImageGenerateParamsBase,
  ImageGenerateParamsNonStreaming,
  ImageGenerateParamsStreaming,
  ImagesResponse,
} from 'openai/resources/images'
import type { SpeechCreateParams } from 'openai/resources/audio/speech'
import type {
  Transcription,
  TranscriptionCreateParamsNonStreaming,
  TranscriptionCreateParamsStreaming,
  TranscriptionCreateResponse,
  TranscriptionStreamEvent,
  TranscriptionVerbose,
} from 'openai/resources/audio/transcriptions'
import type {
  FileCreateParams,
  FileDeleted,
  FileObject,
} from 'openai/resources/files'
import type {
  Video,
  VideoCreateParams,
  VideoDownloadContentParams,
} from 'openai/resources/videos'
import type { Decision, DecisionCreateParams } from 'openai/resources/decisions'

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
 * method names, arguments, and results match the SDK. A stream is an
 * `AsyncIterable` of the SDK event type.
 *
 * Both `createOpenAIClient()` and a real `new OpenAI()` (or `AzureOpenAI`)
 * fit this type.
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
          body: ChatCompletionCreateParamsNonStreaming,
          options?: RequestOptions,
        ): Promise<ChatCompletion>
        (
          body: ChatCompletionCreateParamsStreaming,
          options?: RequestOptions,
        ): Promise<AsyncIterable<ChatCompletionChunk>>
        (
          body: ChatCompletionCreateParamsBase,
          options?: RequestOptions,
        ): Promise<AsyncIterable<ChatCompletionChunk> | ChatCompletion>
      }
    }
  }
  readonly responses: {
    readonly create: {
      (
        body: ResponseCreateParamsNonStreaming,
        options?: RequestOptions,
      ): Promise<OpenAIResponse>
      (
        body: ResponseCreateParamsStreaming,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ResponseStreamEvent>>
      (
        body: ResponseCreateParamsBase,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ResponseStreamEvent> | OpenAIResponse>
    }
    readonly compact: (
      body: ResponseCompactParams,
      options?: RequestOptions,
    ) => Promise<CompactedResponse>
  }
  readonly embeddings: {
    readonly create: {
      (
        body: EmbeddingCreateParams & { encoding_format: 'base64' },
        options?: RequestOptions,
      ): Promise<Base64EmbeddingResponse>
      (
        body: EmbeddingCreateParams,
        options?: RequestOptions,
      ): Promise<CreateEmbeddingResponse>
    }
  }
  readonly images: {
    readonly generate: {
      (
        body: ImageGenerateParamsNonStreaming,
        options?: RequestOptions,
      ): Promise<ImagesResponse>
      (
        body: ImageGenerateParamsStreaming,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageGenStreamEvent>>
      (
        body: ImageGenerateParamsBase,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageGenStreamEvent> | ImagesResponse>
    }
    readonly edit: {
      (
        body: ImageEditParamsNonStreaming,
        options?: RequestOptions,
      ): Promise<ImagesResponse>
      (
        body: ImageEditParamsStreaming,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageEditStreamEvent>>
      (
        body: ImageEditParamsBase,
        options?: RequestOptions,
      ): Promise<AsyncIterable<ImageEditStreamEvent> | ImagesResponse>
    }
  }
  readonly audio: {
    readonly speech: {
      /** Resolves to the raw `Response`. Read it with `.arrayBuffer()`. */
      readonly create: (
        body: SpeechCreateParams,
        options?: RequestOptions,
      ) => Promise<Response>
    }
    readonly transcriptions: {
      readonly create: {
        (
          body: TranscriptionCreateParamsNonStreaming<'json' | undefined>,
          options?: RequestOptions,
        ): Promise<Transcription>
        (
          body: TranscriptionCreateParamsNonStreaming<'verbose_json'>,
          options?: RequestOptions,
        ): Promise<TranscriptionVerbose>
        (
          body: TranscriptionCreateParamsNonStreaming<'srt' | 'vtt' | 'text'>,
          options?: RequestOptions,
        ): Promise<string>
        (
          body: TranscriptionCreateParamsNonStreaming,
          options?: RequestOptions,
        ): Promise<Transcription>
        (
          body: TranscriptionCreateParamsStreaming,
          options?: RequestOptions,
        ): Promise<AsyncIterable<TranscriptionStreamEvent>>
        (
          body: TranscriptionCreateParamsStreaming,
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
      body: VideoCreateParams,
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
