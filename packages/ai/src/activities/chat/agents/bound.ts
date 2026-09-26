import { chat } from '../index'
import { summarize } from '../../summarize/index'
import { generateImage } from '../../generateImage/index'
import { generateVideo } from '../../generateVideo/index'
import { generateAudio } from '../../generateAudio/index'
import { generateSpeech } from '../../generateSpeech/index'
import { generateVoice } from '../../generateVoice/index'
import { generateTranscription } from '../../generateTranscription/index'
import { generateWorld } from '../../generateWorld/index'
import { generateLiveVideo } from '../../generateLiveVideo/index'
import { embed } from '../../embed/index'
import { rerank } from '../../rerank/index'
import { decide } from '../../evaluate/index'
import type { GenerationMiddleware } from '../../middleware/types'
import type { AnyChatMiddleware } from '../middleware/types'
import type { RunAgentResumeItem } from '../../../types'
import type { SubagentRunInput } from './define-agent'

/**
 * The fields a child `chat()` needs, in one spread:
 * `chat({ adapter, messages, ...ctx.forward })`.
 */
export interface SubagentForward {
  threadId: string
  runId: string
  parentRunId: string
  subagentRunId: string
  resume?: Array<RunAgentResumeItem>
  /** Aborts when the parent run or the subagent group stops. */
  abortController: AbortController
}

/**
 * What a host (for example a harness session) adds to every activity call an
 * agent makes through `ctx`. Apps using plain `chat({ subagents })` do not set
 * it.
 */
export interface SubagentBinding {
  /** Added before the call's own middleware on every `ctx.chat` call. */
  chatMiddleware?: ReadonlyArray<AnyChatMiddleware>
  /** Added before the call's own middleware on every generation call. */
  generationMiddleware?: ReadonlyArray<GenerationMiddleware>
}

/**
 * Activity functions bound to one child run. Each takes the same options as
 * the plain function. Options you pass win over the bound defaults.
 */
export interface BoundActivities {
  chat: typeof chat
  summarize: typeof summarize
  generateImage: typeof generateImage
  generateVideo: typeof generateVideo
  generateAudio: typeof generateAudio
  generateSpeech: typeof generateSpeech
  generateVoice: typeof generateVoice
  generateTranscription: typeof generateTranscription
  generateWorld: typeof generateWorld
  generateLiveVideo: typeof generateLiveVideo
  embed: typeof embed
  rerank: typeof rerank
  decide: typeof decide
}

/** Options every bound call can receive. Typed loosely: each wrapper forwards
 *  to a function whose own signature checks the caller. */
type LooseOptions = Record<string, any> & {
  middleware?: Array<unknown>
}

export function createBoundActivities(
  input: SubagentRunInput,
  abortController: AbortController,
  binding?: SubagentBinding,
): BoundActivities {
  let calls = 0
  const signal = abortController.signal
  const chatMiddleware = binding?.chatMiddleware ?? []
  const generationMiddleware = binding?.generationMiddleware ?? []

  // Every generation call gets its own run id under the child run.
  const ids = (activity: string) => {
    calls += 1
    return {
      threadId: input.threadId,
      runId: `${input.runId}:${activity}-${calls}`,
    }
  }
  const withGenerationMiddleware = (options: LooseOptions) => ({
    ...options,
    middleware: [...generationMiddleware, ...(options.middleware ?? [])],
  })
  // Activities that accept thread and run ids plus an abort signal.
  const full = (activity: string, options: LooseOptions) =>
    withGenerationMiddleware({
      ...ids(activity),
      abortSignal: signal,
      ...options,
    })

  return {
    chat: ((options: LooseOptions) =>
      chat({
        messages: input.messages,
        threadId: input.threadId,
        runId: input.runId,
        parentRunId: input.parentRunId,
        subagentRunId: input.subagentRunId,
        ...(input.resume ? { resume: input.resume } : {}),
        abortController,
        ...options,
        middleware: [...chatMiddleware, ...(options.middleware ?? [])],
      } as never)) as typeof chat,
    summarize: ((options: LooseOptions) =>
      summarize(full('summarize', options) as never)) as typeof summarize,
    generateImage: ((options: LooseOptions) =>
      generateImage(full('image', options) as never)) as typeof generateImage,
    generateVideo: ((options: LooseOptions) =>
      generateVideo(full('video', options) as never)) as typeof generateVideo,
    generateAudio: ((options: LooseOptions) =>
      generateAudio(full('audio', options) as never)) as typeof generateAudio,
    generateSpeech: ((options: LooseOptions) =>
      generateSpeech(
        full('speech', options) as never,
      )) as typeof generateSpeech,
    generateVoice: ((options: LooseOptions) =>
      generateVoice(full('voice', options) as never)) as typeof generateVoice,
    generateTranscription: ((options: LooseOptions) =>
      generateTranscription(
        full('transcription', options) as never,
      )) as typeof generateTranscription,
    generateWorld: ((options: LooseOptions) =>
      generateWorld(full('world', options) as never)) as typeof generateWorld,
    generateLiveVideo: ((options: LooseOptions) =>
      generateLiveVideo(
        full('liveVideo', options) as never,
      )) as typeof generateLiveVideo,
    // `embed` takes neither ids nor an abort signal.
    embed: ((options: LooseOptions) =>
      embed(withGenerationMiddleware(options) as never)) as typeof embed,
    // `rerank` and `decide` take an abort signal but no ids.
    rerank: ((options: LooseOptions) =>
      rerank(
        withGenerationMiddleware({ abortSignal: signal, ...options }) as never,
      )) as typeof rerank,
    decide: ((options: LooseOptions) =>
      decide(
        withGenerationMiddleware({ abortSignal: signal, ...options }) as never,
      )) as typeof decide,
  }
}
