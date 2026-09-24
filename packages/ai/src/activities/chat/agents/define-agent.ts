import type { SubagentInfo as AGUISubagentInfo } from '@ag-ui/core'
import type { InterruptDefinition } from '../../../interrupt-definition'
import type {
  AnyTool,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
  UIMessage,
} from '../../../types'
import type { AnyClientTool } from '../tools/tool-definition'

/**
 * Context the library passes into {@link defineAgent} `run`.
 */
export interface SubagentRunContext {
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
  parentSubagentRunId?: string
}

/**
 * A tool a child agent can carry into client part types.
 * Server tools and client tools both qualify.
 */
export type SubagentTool = AnyTool | AnyClientTool

/**
 * A named child agent. `run` is a `chat()` call (or any stream of AG-UI chunks).
 * `TTools` and `TSchema` stay on the object so `useChat({ subagents })` can
 * type that child's parts.
 */
export interface DefinedAgent<
  TName extends string = string,
  TTools extends ReadonlyArray<SubagentTool> = ReadonlyArray<SubagentTool>,
  TSchema extends SchemaInput | undefined = SchemaInput | undefined,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> extends AGUISubagentInfo {
  name: TName
  /** Required here: the router and the synthetic tool both read it. */
  description: string
  run: (
    ctx: SubagentRunContext,
  ) => AsyncIterable<StreamChunk> | Promise<AsyncIterable<StreamChunk>>
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
>(agent: DefinedAgent<TName, TTools, TSchema, TInterrupts>) {
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
