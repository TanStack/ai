import * as core from '@tanstack/ai'
import { toEffect, toStream } from './lift'
import type { Effect, Stream } from 'effect'
import type {
  AnyImageAdapter,
  AnyVideoAdapter,
  StreamChunk,
} from '@tanstack/ai'
import type {
  ImageActivityOptions,
  VideoCreateOptions,
} from '@tanstack/ai/adapters'
import type { AIError } from './lift'

/** The wrapper owns the signal, so callers cannot pass one. */
type NoSignal = { abortSignal?: never }

/** A core stream result becomes a `Stream`. A promise result becomes an `Effect`. */
type Lifted<R> =
  R extends AsyncIterable<infer C>
    ? Stream.Stream<C, AIError>
    : Effect.Effect<Awaited<R>, AIError>

/**
 * Wraps one core activity. TypeScript carries the core generics over to the
 * returned function, so per-model option checks still work.
 */
const wrap =
  <O extends { abortSignal?: AbortSignal; stream?: boolean }, R>(
    run: (options: O) => R,
  ) =>
  (options: O & NoSignal) =>
    // Core types its result as a conditional on `TStream`, so TypeScript cannot pick the branch here. `options.stream` picks it at runtime.
    (options.stream === true
      ? toStream(
          (signal) =>
            run({
              ...options,
              abortSignal: signal,
            }) as AsyncIterable<StreamChunk>,
        )
      : toEffect(
          (signal) =>
            run({ ...options, abortSignal: signal }) as Promise<Awaited<R>>,
        )) as Lifted<R>

/**
 * Summarizes text. Returns an `Effect` of the summary, or a `Stream` of chunks
 * with `stream: true`.
 *
 * @example
 * const summary = yield* summarize({ adapter, text })
 */
export const summarize = wrap(core.summarize)

/** Orders documents by relevance to a query. Returns an `Effect`. */
export const rerank = wrap(core.rerank)

/** Asks the model typed questions about a state. Returns an `Effect` of the answers. */
export const decide = wrap(core.decide)

/**
 * Generates images. Returns an `Effect` of the result, or a `Stream` of
 * chunks with `stream: true`. `size` and `modelOptions` are checked against
 * the adapter's model.
 *
 * @example
 * const { images } = yield* generateImage({ adapter, prompt: 'A red fox' })
 */
export const generateImage = <
  TAdapter extends AnyImageAdapter,
  TStream extends boolean = false,
>(
  options: ImageActivityOptions<TAdapter, TStream> & NoSignal,
) => wrap(core.generateImage<TAdapter, TStream>)(options)

/** Generates audio. Returns an `Effect`, or a `Stream` with `stream: true`. */
export const generateAudio = wrap(core.generateAudio)

/**
 * Starts a video job. Returns an `Effect` of the job, or a `Stream` of the
 * whole job lifecycle with `stream: true`.
 */
export const generateVideo = <
  TAdapter extends AnyVideoAdapter,
  TStream extends boolean = false,
>(
  options: VideoCreateOptions<TAdapter, TStream> & NoSignal,
) => wrap(core.generateVideo<TAdapter, TStream>)(options)

/** Reads the status of a video job. Returns an `Effect`. */
export const getVideoJobStatus = <TAdapter extends AnyVideoAdapter>(
  options: Parameters<typeof core.getVideoJobStatus<TAdapter>>[0] & NoSignal,
  // Core does not export the result type, so the declaration file needs this annotation to name it.
): Lifted<ReturnType<typeof core.getVideoJobStatus<TAdapter>>> =>
  wrap(core.getVideoJobStatus<TAdapter>)(options)

/** Turns text into speech. Returns an `Effect`, or a `Stream` with `stream: true`. */
export const generateSpeech = wrap(core.generateSpeech)

/** Lists the voices of a speech adapter's account. Returns an `Effect`. */
export const listVoices = wrap(core.listVoices)

/** Designs or clones a voice. Returns an `Effect`, or a `Stream` with `stream: true`. */
export const generateVoice = wrap(core.generateVoice)

/** Turns audio into text. Returns an `Effect`, or a `Stream` with `stream: true`. */
export const generateTranscription = wrap(core.generateTranscription)

/**
 * Makes embedding vectors. Returns an `Effect`. Interrupting the fiber aborts
 * the request.
 */
export const embed = wrap(core.embed)

/** Generates a world. Returns an `Effect`, or a `Stream` with `stream: true`. */
export const generateWorld = wrap(core.generateWorld)

/** Starts a live video session. Returns an `Effect`, or a `Stream` with `stream: true`. */
export const generateLiveVideo = wrap(core.generateLiveVideo)

/** Uploads a file to the provider. Returns an `Effect` of the file handle. */
export const uploadFile = wrap(core.uploadFile)

/** Reads the metadata of an uploaded file. Returns an `Effect` of the file handle. */
export const getFile = wrap(core.getFile)

/** Deletes an uploaded file. Returns an `Effect`. */
export const deleteFile = wrap(core.deleteFile)
