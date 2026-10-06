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
  ContentPart,
  PromptCacheRetention,
  RunAgentResumeItem,
} from '../../../types'
import type { DefinedAgent, SubagentRunInput } from './define-agent'
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
  resume?: Array<RunAgentResumeItem>
  /** Aborts when the parent run or the subagent group stops. */
  abortController: AbortController
  /** The prompt cache retention of the parent call, when it has one. */
  promptCache?: PromptCacheRetention
}

/** The steps of an agent run, as `ctx.step`. */
export interface AgentStep {
  /**
   * Run `fn` for `name`, and return its value. When a host runs a stopped
   * agent again (a harness agent started with `resume: true`), a finished
   * step returns its stored value and `fn` does not run again. Without such a
   * host, `fn` runs each time. The value must be JSON. Use a name that is the
   * same on every run.
   */
  do: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>
}

/**
 * An agent run that `ctx.agents.start` started in the background. Await it
 * for the run's result.
 */
export interface AgentRunHandle<
  TResult = unknown,
> extends PromiseLike<TResult> {
  readonly id: string
  /**
   * Add a message to the run: `'steer'` (default) for its next model call,
   * or `'followUp'` to run the agent again after the run ends. The host
   * decides the details.
   */
  send: (
    message: string | Array<ContentPart>,
    options?: { mode?: 'steer' | 'followUp'; inputId?: string },
  ) => Promise<unknown>
  /** Stop the run. */
  cancel: () => Promise<unknown>
}

/** `ctx.agents`: start agents in the background. A host gives it. */
export interface AgentStarter {
  /**
   * Start `agent` (a definition, or a name the host knows) in the
   * background, and return its run at once. Throws when the host refuses
   * it, for example over the subagent tree budget.
   */
  start: (
    agent: DefinedAgent | string,
    input?: unknown,
    options?: {
      wake?: boolean
      attach?: 'reference' | 'none'
      resume?: boolean
    },
  ) => AgentRunHandle
}

/**
 * What a host (for example a harness session) adds to every activity call an
 * agent makes through `ctx`. Apps using plain `chat({ subagents })` do not set
 * it.
 */
export interface SubagentBinding {
  /**
   * The steps the agent reads as `ctx.step`. Only this agent run gets them,
   * not the children it starts. Without them, `ctx.step.do` runs `fn` each
   * time.
   */
  step?: AgentStep
  /**
   * What the agent reads as `ctx.agents`: it starts agents in the
   * background. Only this agent run gets it, not the children it starts in
   * a `ctx.chat({ subagents })`. Without it, `ctx.agents.start` throws.
   */
  agents?: AgentStarter
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
   * The provider keys an agent reads as `ctx.keys`. A child's
   * `ctx.chat({ subagents })` passes them down to its own children. Without
   * them, `ctx.keys` reads each provider's `env` names.
   */
  keys?: ProviderKeys
  /**
   * The prompt cache retention of the parent call. A child's `ctx.chat()`
   * uses it when the call gives no `promptCache`.
   */
  promptCache?: PromptCacheRetention
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
  agentName: string,
  input: SubagentRunInput,
  abortController: AbortController,
  binding?: SubagentBinding,
) {
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
