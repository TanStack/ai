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
import type { InterruptDefinition } from '../../../interrupt-definition'
import type { AnyChatMiddleware } from '../middleware/types'
import type { PromptCacheRetention, RunAgentResumeItem } from '../../../types'
import type {
  SubagentContextExtension,
  SubagentRunContext,
  SubagentRunInput,
} from './define-agent'
import type { SubagentBudget } from './limits'
import type { ProviderKeys } from '../../../byok/keyed'

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
 *
 * @internal For hosts that run agents, such as `@tanstack/ai-harness`.
 */
export interface SubagentBinding {
  /**
   * Added before the call's own middleware on every `ctx.chat` call. A
   * child's `ctx.chat({ subagents })` passes it down to its own children.
   */
  chatMiddleware?: ReadonlyArray<AnyChatMiddleware>
  /**
   * Added after the call's own middleware on every `ctx.chat` call, so it
   * sees the final config and tool results (for example a host middleware
   * that scrubs secrets or logs results). A child's `ctx.chat({ subagents })`
   * passes it down to its own children, after their own.
   */
  lastChatMiddleware?: ReadonlyArray<AnyChatMiddleware>
  /**
   * Added before the call's own middleware on every generation call. A
   * child's `ctx.chat({ subagents })` passes it down to its own children.
   */
  generationMiddleware?: ReadonlyArray<GenerationMiddleware>
  /**
   * Interrupt definitions added to every `ctx.chat` call, so the host
   * middleware in `chatMiddleware` can stop the child with them. The call's
   * own `interrupts` (for example, the agent's own definitions) win: a host
   * definition with the same id is not added. A child's
   * `ctx.chat({ subagents })` passes them down to its own children. A plain
   * `chat()` call does not get them.
   */
  interrupts?: ReadonlyArray<InterruptDefinition<any, any, any, any>>
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
   * Adds fields to the `ctx` of every run. A host declares their types by
   * augmenting `SubagentContextExtension`. It passes down to nested children.
   */
  extend?: (ctx: SubagentRunContext) => Partial<SubagentContextExtension>
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

type AnyInterruptDefinition = InterruptDefinition<any, any, any, any>

/**
 * The host definitions, then the call's own. The call's own definitions win:
 * a host definition with the same id is left out.
 */
function mergeInterrupts(
  host: ReadonlyArray<AnyInterruptDefinition>,
  own: ReadonlyArray<AnyInterruptDefinition> | undefined,
): Array<AnyInterruptDefinition> {
  const ids = new Set((own ?? []).map((definition) => definition.id))
  return [
    ...host.filter((definition) => !ids.has(definition.id)),
    ...(own ?? []),
  ]
}

export function createBoundActivities(
  agentName: string,
  input: SubagentRunInput,
  abortController: AbortController,
  binding?: SubagentBinding,
) {
  let calls = 0
  let chatCalls = 0
  const signal = abortController.signal
  const chatMiddleware = binding?.chatMiddleware ?? []
  const lastChatMiddleware = binding?.lastChatMiddleware ?? []
  const generationMiddleware = binding?.generationMiddleware ?? []
  const interrupts = binding?.interrupts ?? []

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
                  lastChatMiddleware: [
                    ...(options.subagents.binding?.lastChatMiddleware ?? []),
                    ...lastChatMiddleware,
                  ],
                  generationMiddleware: [
                    ...generationMiddleware,
                    ...(options.subagents.binding?.generationMiddleware ?? []),
                  ],
                  ...(interrupts.length > 0
                    ? {
                        interrupts: mergeInterrupts(
                          interrupts,
                          options.subagents.binding?.interrupts,
                        ),
                      }
                    : {}),
                  ...(binding?.budget ? { budget: binding.budget } : {}),
                  ...(binding?.extend ? { extend: binding.extend } : {}),
                },
              },
            }
          : {}),
        // The host middleware can stop the call with the host interrupts.
        ...(interrupts.length > 0
          ? { interrupts: mergeInterrupts(interrupts, options.interrupts) }
          : {}),
        middleware: [
          ...chatMiddleware,
          ...(options.middleware ?? []),
          ...lastChatMiddleware,
        ],
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
  } satisfies BoundActivities
}
