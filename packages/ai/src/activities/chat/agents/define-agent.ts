import type { InterruptDefinition } from '../../../interrupt-definition'
import type {
  AnyTool,
  ModelMessage,
  SchemaInput,
  StreamChunk,
  UIMessage,
} from '../../../types'

/**
 * Context the library passes into {@link defineAgent} `run`.
 */
export interface SubagentRunContext {
  messages: Array<UIMessage | ModelMessage>
  abortSignal?: AbortSignal
  threadId: string
  runId: string
  parentRunId: string
  parentSubagentRunId?: string
}

/**
 * A named child agent. `run` is a `chat()` call (or any stream of AG-UI chunks).
 */
export interface DefinedAgent<TName extends string = string> {
  name: TName
  description: string
  run: (
    ctx: SubagentRunContext,
  ) => AsyncIterable<StreamChunk> | Promise<AsyncIterable<StreamChunk>>
  tools?: ReadonlyArray<AnyTool>
  interrupts?: ReadonlyArray<InterruptDefinition<any, any, any, any>>
  outputSchema?: SchemaInput
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
 * Define a named child agent. Pass the same object to `chat({ subagents })`
 * and to client `createChatHook` options.
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
 *     }),
 * })
 * ```
 */
export function defineAgent<const TName extends string>(
  agent: DefinedAgent<TName>,
) {
  if (agent.name.trim() === '') {
    throw new Error('defineAgent requires a non-empty name')
  }
  if (agent.description.trim() === '') {
    throw new Error('defineAgent requires a non-empty description')
  }
  return agent
}
