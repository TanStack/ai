import type { SubagentInfo as AGUISubagentInfo } from '@ag-ui/core'
import type { InterruptDefinition } from '../../../interrupt-definition'
import type {
  AnyTool,
  InferSchemaType,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
  UIMessage,
} from '../../../types'
import type { AnyClientTool } from '../tools/tool-definition'
import type {
  AgentStarter,
  AgentStep,
  BoundActivities,
  SubagentForward,
} from './bound'
import type { ProviderKeys } from '../../../byok/keyed'

/**
 * What the library knows about a child run before `run` starts.
 * `TInput` is the agent's `inputSchema`.
 */
export interface SubagentRunInput<
  TInput extends SchemaInput | undefined = any,
> {
  /**
   * The input the parent model or the router gave this child, checked
   * against `inputSchema`. `undefined` when the agent has no `inputSchema`.
   */
  input: TInput extends SchemaInput ? InferSchemaType<TInput> : undefined
  messages: Array<UIMessage | ModelMessage>
  abortSignal?: AbortSignal
  threadId: string
  /** Run id for the child `chat()`. */
  runId: string
  /**
   * The run this child run continues. It is the parent chat run on the first
   * run, and the interrupted parent run on a resume. Pass it to the child
   * `chat()`.
   */
  parentRunId: string
  /** Answers to this child's interrupts. Pass it to the child `chat()`. */
  resume?: Array<RunAgentResumeItem>
  /**
   * The child's AG-UI run id. Stays the same when an interrupted child
   * continues. Pass it to the child `chat()` so its middleware sees
   * `ctx.subagentRunId`.
   */
  subagentRunId: string
  /** The subagentRunId of the child that started this one, for a nested child. */
  parentSubagentRunId?: string
}

/**
 * Context the library passes into {@link defineAgent} `run`.
 *
 * - `forward` holds the fields a child `chat()` needs, in one spread:
 *   `chat({ adapter, messages, ...ctx.forward })`.
 * - The activity functions (`ctx.chat`, `ctx.generateImage`, and the rest)
 *   take the same options as the plain functions and fill in the thread id,
 *   a run id, the abort signal, and any middleware a host adds.
 * - `keys` finds provider keys. `await ctx.keys.adapter(adapter)` builds a
 *   `keyedAdapter(...)`. A host sets the keys. Without a host, they come
 *   from each provider's `env` names, and a missing key throws an error that
 *   names the env var.
 * - `step.do(name, fn)` keeps a side effect from running twice when a host
 *   runs the agent again after a crash. See {@link AgentStep}.
 * - `agents.start(agent, input, options)` starts an agent in the
 *   background, when a host (a harness session) runs this agent. Without
 *   such a host it throws.
 */
export type SubagentRunContext<TInput extends SchemaInput | undefined = any> =
  SubagentRunInput<TInput> &
    BoundActivities & {
      forward: SubagentForward
      keys: ProviderKeys
      step: AgentStep
      agents: AgentStarter
    }

/**
 * What an agent makes. Informative: plugins use it to find an agent by the
 * kind of output it produces.
 */
export type AgentProduces =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'speech'
  | 'voice'
  | 'transcription'
  | 'embedding'
  | 'world'
  | 'liveVideo'
  | (string & {})

/**
 * A tool a child agent can carry into client part types.
 * Server tools and client tools both qualify.
 */
export type SubagentTool = AnyTool | AnyClientTool

/**
 * A named child agent. `run` is a `chat()` call (or any stream of AG-UI
 * chunks), or a promise of a plain value such as an image result.
 * `TTools` and `TSchema` stay on the object so `useChat({ subagents })` can
 * type that child's parts. `TResult` is the value a promise `run` resolves to.
 */
export interface DefinedAgent<
  TName extends string = string,
  TTools extends ReadonlyArray<SubagentTool> = ReadonlyArray<SubagentTool>,
  TSchema extends SchemaInput | undefined = SchemaInput | undefined,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    ReadonlyArray<InterruptDefinition<any, any, any, any>>,
  TInput extends SchemaInput | undefined = any,
  TResult = unknown,
  TProduces extends AgentProduces | undefined = AgentProduces | undefined,
> extends AGUISubagentInfo {
  name: TName
  /** Required here: the router and the synthetic tool both read it. */
  description: string
  run: (
    ctx: SubagentRunContext<TInput>,
  ) =>
    | AsyncIterable<StreamChunk>
    | Promise<AsyncIterable<StreamChunk>>
    | Promise<TResult>
  /** What this agent makes. See {@link AgentProduces}. */
  produces?: TProduces
  /**
   * The input this agent needs, such as a short brief. `run` reads it as
   * `ctx.input`. In tool mode, the parent model writes it when it calls this
   * agent's tool. A `subagents.router` gives it in its pick as
   * `{ name, input }`. The input is checked against this schema first.
   */
  inputSchema?: TInput
  tools?: TTools
  interrupts?: TInterrupts
  outputSchema?: TSchema
  subagents?: unknown
}

/**
 * Choice options for a `decide()` router. `main` is required plus every agent name.
 */
export type SubagentChoiceOptions<TAgents extends ReadonlyArray<DefinedAgent>> =
  { main: string } & {
    [K in TAgents[number]['name']]: string
  }

/**
 * Define a named child agent. Pass the same object to `chat({ subagents })`.
 * Pass the agents array to `useChat({ subagents })` when you render parts
 * yourself. The hook uses it for types only. It does not call `run`.
 *
 * @example
 * ```ts
 * const researcher = defineAgent({
 *   name: 'researcher',
 *   description: 'Looks up facts',
 *   run: (ctx) =>
 *     chat({
 *       adapter: openaiText('gpt-5.6'),
 *       messages: ctx.messages,
 *       threadId: ctx.threadId,
 *       runId: ctx.runId,
 *       parentRunId: ctx.parentRunId,
 *       subagentRunId: ctx.subagentRunId,
 *       resume: ctx.resume,
 *     }),
 * })
 * ```
 */
export function defineAgent<
  const TName extends string,
  const TTools extends ReadonlyArray<SubagentTool> = readonly [],
  TSchema extends SchemaInput | undefined = undefined,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
  TInput extends SchemaInput | undefined = undefined,
  TResult = unknown,
  const TProduces extends AgentProduces | undefined = undefined,
>(
  agent: DefinedAgent<
    TName,
    TTools,
    TSchema,
    TInterrupts,
    TInput,
    TResult,
    TProduces
  >,
) {
  if (agent.name.trim() === '') {
    throw new Error('defineAgent requires a non-empty name')
  }
  // A router returns 'main' to keep the turn on the parent.
  if (agent.name.trim() === 'main') {
    throw new Error(
      "defineAgent cannot use the name 'main'. A router uses it for the parent.",
    )
  }
  if (agent.description.trim() === '') {
    throw new Error('defineAgent requires a non-empty description')
  }
  return agent
}
