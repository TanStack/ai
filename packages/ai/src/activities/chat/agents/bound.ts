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
import type {
  PromptCacheRetention,
  RunAgentResumeItem,
  SchemaInput,
} from '../../../types'
import type { DefinedAgent, SubagentRunInput } from './define-agent'
import type { SubagentBudget } from './limits'
import type { ProviderKeys } from '../../../byok/keyed'
import type {
  BoundTextActivityOptions,
  TextActivityOptions,
  TextActivityResult,
  WithOptionalThreadId,
} from '../index'
import type { AnyTextAdapter } from '../adapter'
import type { InterruptDefinition } from '../../../interrupt-definition'
import type {
  SummarizeActivityOptions,
  SummarizeActivityResult,
} from '../../summarize/index'
import type { SummarizeAdapter } from '../../summarize/adapter'
import type {
  ImageActivityOptions,
  ImageActivityResult,
} from '../../generateImage/index'
import type { ImageAdapter } from '../../generateImage/adapter'
import type {
  VideoActivityResult,
  VideoCreateOptions,
} from '../../generateVideo/index'
import type { VideoAdapter } from '../../generateVideo/adapter'
import type {
  AudioActivityOptions,
  AudioActivityResult,
  AudioProviderOptions,
} from '../../generateAudio/index'
import type { AudioAdapter } from '../../generateAudio/adapter'
import type {
  TTSActivityOptionsBase,
  TTSActivityResult,
  TTSProviderOptions,
  TTSTextOrTurns,
} from '../../generateSpeech/index'
import type { TTSAdapter } from '../../generateSpeech/adapter'
import type {
  VoiceActivityOptions,
  VoiceActivityResult,
  VoiceProviderOptions,
} from '../../generateVoice/index'
import type { VoiceAdapter } from '../../generateVoice/adapter'
import type {
  TranscriptionActivityOptions,
  TranscriptionActivityResult,
  TranscriptionProviderOptions,
} from '../../generateTranscription/index'
import type { TranscriptionAdapter } from '../../generateTranscription/adapter'
import type {
  WorldActivityOptions,
  WorldActivityResult,
  WorldProviderOptions,
} from '../../generateWorld/index'
import type { WorldAdapter } from '../../generateWorld/adapter'
import type {
  LiveVideoActivityOptions,
  LiveVideoActivityResult,
  LiveVideoProviderOptions,
} from '../../generateLiveVideo/index'
import type { LiveVideoAdapter } from '../../generateLiveVideo/adapter'

/**
 * The fields a child `chat()` needs, in one spread:
 * `chat({ adapter, messages, ...ctx.forward })`.
 */
export interface SubagentForward {
  threadId: string
  runId: string
  parentRunId: string
  subagentRunId: string
  /** The agent name. Middleware reads it as `ctx.subagentName`. */
  subagentName: string
  /** The subagentRunId of the child that started this one, for a nested child. */
  parentSubagentRunId?: string
  resume?: Array<RunAgentResumeItem>
  /** Aborts when the parent run or the subagent group stops. */
  abortController: AbortController
  /** The prompt cache retention of the parent call, when it has one. */
  promptCache?: PromptCacheRetention
}

/**
 * What a host adds to every activity call an agent makes through `ctx`. Apps
 * using plain `chat({ subagents })` do not set it.
 */
export interface SubagentBinding {
  /**
   * Added before the call's own middleware on every `ctx.chat` call. A
   * child's `ctx.chat({ subagents })` passes it down to its own children.
   */
  chatMiddleware?: ReadonlyArray<AnyChatMiddleware>
  /**
   * Added before the call's own middleware on every generation call. A
   * child's `ctx.chat({ subagents })` passes it down to its own children.
   */
  generationMiddleware?: ReadonlyArray<GenerationMiddleware>
  /**
   * The subagent tree budget. A child's `ctx.chat({ subagents })` passes it
   * down, so limits hold across the whole tree.
   */
  budget?: SubagentBudget
  /**
   * The provider keys an agent reads as `ctx.keys`. `subagents.keys` sets
   * them. A child's `ctx.chat({ subagents })` passes them down to its own
   * children. Without them, `ctx.keys` reads each provider's `env` names.
   */
  keys?: ProviderKeys
  /**
   * The prompt cache retention of the parent call. A child's `ctx.chat()`
   * uses it when the call gives no `promptCache`.
   */
  promptCache?: PromptCacheRetention
  /**
   * Starts a child without waiting for it and returns its id at once. The
   * agent tools call it for `background: true`. With
   * `wake: true`, the host starts a new parent turn when the child ends. It
   * does not pass down to nested children.
   */
  start?: (
    call: {
      agent: string
      input?: unknown
      prompt?: string
      parentToolCallId?: string
    },
    options: { wake: true },
  ) => Promise<{
    subagentRunId: string
    /** Settles when the child ends. `maxConcurrent` counts the child until then. */
    done: Promise<unknown>
  }>
}

/**
 * Activity functions bound to one child run. Each takes the same options as
 * the plain function, but `threadId` is optional: the child run fills it.
 * Options you pass win over the bound defaults.
 */
export interface BoundActivities {
  chat: <
    TAdapter extends AnyTextAdapter,
    TSchema extends SchemaInput | undefined = undefined,
    TStream extends boolean = boolean,
    const TTools extends TextActivityOptions<
      TAdapter,
      TSchema,
      TStream,
      any
    >['tools'] = TextActivityOptions<TAdapter, TSchema, TStream, any>['tools'],
    const TInterrupts extends ReadonlyArray<
      InterruptDefinition<any, any, any, any>
    > = [],
    TContext = unknown,
    const TMiddleware extends Array<unknown> | undefined = undefined,
    const TAgents extends ReadonlyArray<DefinedAgent> =
      ReadonlyArray<DefinedAgent>,
  >(
    options: BoundTextActivityOptions<
      TAdapter,
      TSchema,
      TStream,
      TTools,
      TInterrupts,
      TContext,
      TMiddleware,
      TAgents
    >,
  ) => TextActivityResult<TSchema, TStream, TTools>
  summarize: <
    TAdapter extends SummarizeAdapter<string, object>,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<SummarizeActivityOptions<TAdapter, TStream>>,
  ) => SummarizeActivityResult<TStream>
  generateImage: <
    TAdapter extends ImageAdapter<string, any, any, any>,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<ImageActivityOptions<TAdapter, TStream>>,
  ) => ImageActivityResult<TStream>
  generateVideo: <
    TAdapter extends VideoAdapter<string, any, any, any, any, any>,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<VideoCreateOptions<TAdapter, TStream>>,
  ) => VideoActivityResult<'create', TStream>
  generateAudio: <
    TAdapter extends AudioAdapter<string, AudioProviderOptions<TAdapter>>,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<AudioActivityOptions<TAdapter, TStream>>,
  ) => AudioActivityResult<TStream>
  generateSpeech: <
    TAdapter extends TTSAdapter<string, TTSProviderOptions<TAdapter>>,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<TTSActivityOptionsBase<TAdapter, TStream>> &
      TTSTextOrTurns,
  ) => TTSActivityResult<TStream>
  generateVoice: <
    TAdapter extends VoiceAdapter<string, VoiceProviderOptions<TAdapter>>,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<VoiceActivityOptions<TAdapter, TStream>>,
  ) => VoiceActivityResult<TStream>
  generateTranscription: <
    TAdapter extends TranscriptionAdapter<
      string,
      TranscriptionProviderOptions<TAdapter>
    >,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<
      TranscriptionActivityOptions<TAdapter, TStream>
    >,
  ) => TranscriptionActivityResult<TStream>
  generateWorld: <
    TAdapter extends WorldAdapter<string, WorldProviderOptions<TAdapter>>,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<WorldActivityOptions<TAdapter, TStream>>,
  ) => WorldActivityResult<TStream>
  generateLiveVideo: <
    TAdapter extends LiveVideoAdapter<
      string,
      LiveVideoProviderOptions<TAdapter>
    >,
    TStream extends boolean = false,
  >(
    options: WithOptionalThreadId<LiveVideoActivityOptions<TAdapter, TStream>>,
  ) => LiveVideoActivityResult<TStream>
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
  agentName: string,
  input: SubagentRunInput,
  abortController: AbortController,
  binding?: SubagentBinding,
): BoundActivities {
  let calls = 0
  let chatCalls = 0
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
        // The first call is the child run. A later call gets its own run id.
        runId:
          chatCalls++ === 0 ? input.runId : `${input.runId}:chat-${chatCalls}`,
        parentRunId: input.parentRunId,
        subagentRunId: input.subagentRunId,
        subagentName: agentName,
        parentSubagentRunId: input.parentSubagentRunId,
        ...(input.resume ? { resume: input.resume } : {}),
        ...(binding?.promptCache ? { promptCache: binding.promptCache } : {}),
        abortController,
        ...options,
        // Nested children get the host middleware before their own, share
        // the tree budget, and get the host keys unless the call sets its own.
        ...(options.subagents
          ? {
              subagents: {
                ...options.subagents,
                binding: {
                  ...(binding?.keys ? { keys: binding.keys } : {}),
                  ...options.subagents.binding,
                  chatMiddleware: [
                    ...chatMiddleware,
                    ...(options.subagents.binding?.chatMiddleware ?? []),
                  ],
                  generationMiddleware: [
                    ...generationMiddleware,
                    ...(options.subagents.binding?.generationMiddleware ?? []),
                  ],
                  ...(binding?.budget ? { budget: binding.budget } : {}),
                },
              },
            }
          : {}),
        middleware: [...chatMiddleware, ...(options.middleware ?? [])],
      } as never)) as BoundActivities['chat'],
    summarize: ((options: LooseOptions) =>
      summarize(
        full('summarize', options) as never,
      )) as BoundActivities['summarize'],
    generateImage: ((options: LooseOptions) =>
      generateImage(
        full('image', options) as never,
      )) as BoundActivities['generateImage'],
    generateVideo: ((options: LooseOptions) =>
      generateVideo(
        full('video', options) as never,
      )) as BoundActivities['generateVideo'],
    generateAudio: ((options: LooseOptions) =>
      generateAudio(
        full('audio', options) as never,
      )) as BoundActivities['generateAudio'],
    generateSpeech: ((options: LooseOptions) =>
      generateSpeech(
        full('speech', options) as never,
      )) as BoundActivities['generateSpeech'],
    generateVoice: ((options: LooseOptions) =>
      generateVoice(
        full('voice', options) as never,
      )) as BoundActivities['generateVoice'],
    generateTranscription: ((options: LooseOptions) =>
      generateTranscription(
        full('transcription', options) as never,
      )) as BoundActivities['generateTranscription'],
    generateWorld: ((options: LooseOptions) =>
      generateWorld(
        full('world', options) as never,
      )) as BoundActivities['generateWorld'],
    generateLiveVideo: ((options: LooseOptions) =>
      generateLiveVideo(
        full('liveVideo', options) as never,
      )) as BoundActivities['generateLiveVideo'],
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
