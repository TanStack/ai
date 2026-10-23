import {
  EventType,
  INTERRUPT_BINDING_VERSION,
  canonicalInterruptJson,
  convertMessagesToModelMessages,
  digestInterruptJson,
  hashSchemaInput,
  withInterruptBinding,
  withTanstackMetadata,
} from '@tanstack/ai'
import type {
  Interrupt,
  JSONSchema,
  ModelMessage,
  RunAgentResumeItem,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'
import {
  agentLoop,
  agentLoopContinue,
  runToolCall,
} from '@earendil-works/pi-agent-core'
import type {
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  AgentToolCall,
  AgentTurnDecision,
  StreamFn,
} from '@earendil-works/pi-agent-core'
import { Type } from '@earendil-works/pi-ai'
import type { AssistantMessage, ToolResultMessage } from '@earendil-works/pi-ai'
import { toPiMessages } from './messages'
import { fromPiAgentEvents } from './stream'

/** The `chatParamsFromRequest(request)` fields that `runPiAgent` reads. */
export interface PiAgentRequest {
  threadId: string
  runId: string
  messages: Array<UIMessage | ModelMessage>
  /** The tools of the client, which run in the browser. */
  tools?: ReadonlyArray<{
    name: string
    description: string
    parameters: JSONSchema
  }>
  /** The answers to the interrupts of the paused run. */
  resume?: ReadonlyArray<RunAgentResumeItem>
}

/** Options for {@link runPiAgent}. */
export interface RunPiAgentOptions {
  /** The pi agent loop config: `model`, `convertToLlm` and the hooks. */
  config: AgentLoopConfig
  /** The model call, for example `models.streamSimple.bind(models)`. */
  streamFn: StreamFn
  /** The pi tools, which run on the server. */
  tools?: ReadonlyArray<AgentTool>
  /** The names of the pi tools that a person approves before they run. */
  needsApproval?: ReadonlyArray<string>
  /** The system prompts. The request cannot set them. */
  systemPrompts?: ReadonlyArray<string>
  signal?: AbortSignal
}

const DENIED = 'The user denied this tool call'

function isAssistant(
  message: AgentMessage | undefined,
): message is AssistantMessage {
  return (
    message !== undefined && 'role' in message && message.role === 'assistant'
  )
}

/** A pi tool for a client tool. It never runs on the server. */
function clientAgentTool(
  tool: NonNullable<PiAgentRequest['tools']>[number],
): AgentTool {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: Type.Unsafe(tool.parameters),
    execute: () => {
      throw new Error(`${tool.name} runs on the client.`)
    },
  }
}

/** The approval interrupt for a pi tool call. The client has no copy of the tool. */
function approvalInterrupt(call: AgentToolCall, runId: string): Interrupt {
  const id = `approval_${call.id}`
  return withInterruptBinding(
    {
      id,
      reason: 'tool_call',
      message: `Approval required to run ${call.name}`,
      toolCallId: call.id,
      metadata: {
        kind: 'approval',
        toolName: call.name,
        input: call.arguments,
      },
    },
    {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: id,
      interruptedRunId: runId,
      generation: 0,
    },
  )
}

/** The interrupt that `chat()` sends for a client tool call. */
function clientToolInterrupt(call: AgentToolCall, runId: string): Interrupt {
  const id = `client_tool_${call.id}`
  const responseSchema = {}
  return withInterruptBinding(
    {
      id,
      reason: 'tanstack:client_tool_execution',
      message: `Client tool ${call.name} is ready to run`,
      toolCallId: call.id,
      responseSchema,
      metadata: {
        kind: 'client_tool',
        toolName: call.name,
        input: call.arguments,
      },
    },
    {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: id,
      toolName: call.name,
      toolCallId: call.id,
      outputSchemaHash: hashSchemaInput(undefined),
      responseSchemaHash: digestInterruptJson(
        canonicalInterruptJson(responseSchema),
      ),
      interruptedRunId: runId,
      generation: 0,
    },
  )
}

function textResult(
  call: AgentToolCall,
  text: string,
  isError: boolean,
): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: 'text', text }],
    isError,
    timestamp: Date.now(),
  }
}

function errorOf(entry: RunAgentResumeItem): string | undefined {
  const tanstack: unknown = entry.metadata?.tanstack
  const payload: unknown = entry.payload
  if (
    typeof tanstack === 'object' &&
    tanstack !== null &&
    'state' in tanstack &&
    tanstack.state === 'output-error' &&
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error
  }
  return undefined
}

/**
 * Run a pi agent for a TanStack `useChat` request, as AG-UI events. Serve the
 * result with `toServerSentEventsResponse`.
 *
 * Pass the params of `chatParamsFromRequest(request)`. The history becomes pi
 * messages, and the last message is the prompt.
 *
 * Two kinds of tool call pause the run with an interrupt, as in `chat()`:
 *
 * - A pi tool named in `needsApproval`. `useChat` shows the approval, and the
 *   user answers with `resolveInterrupt({ approved })`. An approved call runs
 *   on the next request, with the pi `beforeToolCall` and `afterToolCall`
 *   hooks.
 * - A client tool (the `tools` of the request). `useChat` runs it and sends
 *   the output back.
 *
 * The next request carries the answers in `resume`. The loop then continues
 * from the tool results with `agentLoopContinue`.
 */
export function runPiAgent(
  request: PiAgentRequest,
  {
    config,
    streamFn,
    tools = [],
    needsApproval = [],
    systemPrompts,
    signal,
  }: RunPiAgentOptions,
): AsyncGenerator<StreamChunk> {
  const { threadId, runId } = request
  const serverNames = new Set(tools.map((tool) => tool.name))
  const clientTools = (request.tools ?? []).filter(
    (tool) => !serverNames.has(tool.name),
  )
  const clientNames = new Set(clientTools.map((tool) => tool.name))
  const allTools = [...tools, ...clientTools.map(clientAgentTool)]

  const history: Array<AgentMessage> = toPiMessages(
    convertMessagesToModelMessages(request.messages),
    {
      ...(systemPrompts && { systemPrompts }),
      model: {
        api: config.model.api,
        provider: config.model.provider,
        model: config.model.id,
      },
    },
  )

  const interrupts = new Map<string, Interrupt>()
  const loopConfig: AgentLoopConfig = {
    ...config,
    beforeToolCall: async (context, hookSignal) => {
      const { toolCall } = context
      if (clientNames.has(toolCall.name)) {
        interrupts.set(toolCall.id, clientToolInterrupt(toolCall, runId))
        return { block: true, reason: 'Waiting for the client' }
      }
      if (needsApproval.includes(toolCall.name)) {
        interrupts.set(toolCall.id, approvalInterrupt(toolCall, runId))
        return { block: true, reason: 'Waiting for approval' }
      }
      return config.beforeToolCall?.(context, hookSignal)
    },
    // A paused call ends the run. The other calls of the batch still run.
    finishTurn: async (
      turn,
      turnSignal,
    ): Promise<AgentTurnDecision | undefined> => {
      const paused = turn.message.content.some(
        (block) => block.type === 'toolCall' && interrupts.has(block.id),
      )
      if (paused) return { action: 'end' }
      return (await config.finishTurn?.(turn, turnSignal)) ?? undefined
    },
  }

  async function* run(): AsyncGenerator<StreamChunk> {
    const resume = request.resume ?? []
    if (resume.length === 0) {
      const prompt = history.pop()
      yield* fromPiAgentEvents(
        agentLoop(
          prompt ? [prompt] : [],
          { messages: history, tools: allTools },
          loopConfig,
          signal,
          streamFn,
        ),
        { threadId, runId, interrupts },
      )
      return
    }

    // The client sends a placeholder tool message for an answered approval.
    // The answer in `resume` replaces it.
    const resumed = new Set(
      resume.map((item) =>
        item.interruptId.replace(/^(approval_|client_tool_)/, ''),
      ),
    )
    for (let i = history.length - 1; i >= 0; i--) {
      const message = history[i]
      if (
        message &&
        'role' in message &&
        message.role === 'toolResult' &&
        resumed.has(message.toolCallId)
      ) {
        history.splice(i, 1)
      }
    }

    // The resumed run answers the calls of the last assistant message that
    // have no result yet.
    const assistant = history.findLast(isAssistant)
    const answered = new Set(
      history.flatMap((message: AgentMessage) =>
        'role' in message && message.role === 'toolResult'
          ? [message.toolCallId]
          : [],
      ),
    )
    const results: Array<ToolResultMessage> = []
    const denied = new Set<string>()
    for (const call of assistant ? assistant.content : []) {
      if (!assistant) break
      if (call.type !== 'toolCall' || answered.has(call.id)) continue
      const entry = resume.find(
        (item) =>
          item.interruptId === `approval_${call.id}` ||
          item.interruptId === `client_tool_${call.id}`,
      )
      const payload: unknown = entry?.payload
      if (!entry || entry.status === 'cancelled') {
        denied.add(call.id)
        results.push(textResult(call, DENIED, true))
      } else if (entry.interruptId.startsWith('client_tool_')) {
        const error = errorOf(entry)
        results.push(
          error !== undefined
            ? textResult(call, error, true)
            : textResult(
                call,
                typeof payload === 'string'
                  ? payload
                  : JSON.stringify(payload ?? null),
                false,
              ),
        )
      } else if (
        payload === true ||
        (typeof payload === 'object' &&
          payload !== null &&
          'approved' in payload &&
          payload.approved === true)
      ) {
        const outcome = await runToolCall(call, {
          tools: allTools,
          assistantMessage: assistant,
          context: { messages: history, tools: allTools },
          ...(signal && { signal }),
          ...(config.beforeToolCall && {
            beforeToolCall: config.beforeToolCall,
          }),
          ...(config.afterToolCall && { afterToolCall: config.afterToolCall }),
        })
        results.push({
          role: 'toolResult',
          toolCallId: call.id,
          toolName: call.name,
          content: outcome.result.content,
          ...(outcome.result.details !== undefined && {
            details: outcome.result.details,
          }),
          isError: outcome.isError,
          timestamp: Date.now(),
        })
      } else {
        denied.add(call.id)
        results.push(textResult(call, DENIED, true))
      }
    }
    history.push(...results)
    const last = history.at(-1)
    if (!last || !('role' in last) || last.role === 'assistant') {
      // Nothing to continue from: the answers matched no paused call.
      yield* fromPiAgentEvents(
        (async function* () {
          yield { type: 'agent_end', messages: [] } as const
        })(),
        { threadId, runId, results },
      )
      return
    }
    // A denial has the denied outcome, as in chat().
    for await (const event of fromPiAgentEvents(
      agentLoopContinue(
        { messages: history, tools: allTools },
        loopConfig,
        signal,
        streamFn,
      ),
      { threadId, runId, interrupts, results },
    )) {
      yield event.type === EventType.TOOL_CALL_RESULT &&
      denied.has(event.toolCallId)
        ? withTanstackMetadata(event, {
            state: 'output-error',
            toolResultOutcome: 'denied',
          })
        : event
    }
  }

  return run()
}
