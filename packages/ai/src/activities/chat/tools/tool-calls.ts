import { normalizeToolResult } from '../../../utilities/tool-result'
import { isStandardSchema, parseWithStandardSchema } from './schema-converter'
import type { ToolApprovalResolution } from '../../../interrupts'
import type {
  AnyTool,
  ContentPart,
  CustomEvent,
  ModelMessage,
  RunFinishedEvent,
  Tool,
  ToolCall,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
  ToolExecutionContext,
  ToolOutputState,
} from '../../../types'
import type {
  AfterToolCallInfo,
  BeforeToolCallDecision,
} from '../middleware/types'
import type { McpResourceReadResult } from '../mcp/types'
import type {
  ContextFromTool,
  DefinedContext,
  MergeContext,
  UnionToIntersection,
} from '../runtime-context-types'

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/**
 * MCP Apps metadata attached to a server tool at discovery (see
 * `@tanstack/ai-mcp` discovery + `MCPManager.discover()`).
 *
 * - `uiResourceUri` / `serverId` are stamped by ai-mcp at tool discovery.
 * - `readResource` is bound by `MCPManager.discover()` (the one site that has
 *   both the tool and its originating source) so the resource can be eagerly
 *   read at the emit site. Under `chat()`-managed MCP lifecycle
 *   (`connection:'close'`), the MCP source is not disposed until the run
 *   drains, so `readResource` is still live at this emit point. Note: a caller
 *   who closes the MCP source early (outside `chat()`'s managed lifecycle)
 *   degrades fail-soft — `readResource` may reject, the widget is absent, but
 *   the tool result still flows to the model.
 *   `@tanstack/ai` never imports `@tanstack/ai-mcp`; this travels structurally
 *   on the tool.
 */
interface McpToolAppMeta {
  uiResourceUri?: string
  serverId?: string
  /** Server-native (unprefixed) MCP tool name — used as the renderer's toolName. */
  serverToolName?: string
  readResource?: (uri: string) => Promise<McpResourceReadResult>
}

function readMcpAppMeta(tool: AnyTool): McpToolAppMeta | undefined {
  const meta = (tool.metadata as { mcp?: McpToolAppMeta } | undefined)?.mcp
  return meta
}

/**
 * Eagerly read a tool's linked `ui://` resource (MCP Apps) and emit a
 * `ui-resource` CUSTOM event so the client can render the widget. The model
 * still receives the normal text tool-result; the widget rides alongside and
 * never enters model input.
 *
 * Fail-soft: any read error logs a warning and emits nothing — it never throws,
 * so the normal tool-result still flows and a broken widget cannot break the run.
 */
async function emitUiResourceIfLinked<TContext>(
  tool: AnyTool,
  context: ToolExecutionContext<TContext>,
): Promise<void> {
  const mcp = readMcpAppMeta(tool)
  const uiUri = mcp?.uiResourceUri
  if (!uiUri || !mcp.readResource) return

  // The try covers ONLY the fallible read — keep `emitCustomEvent` out of it so
  // an exception from the emit path can't be mislabeled as a read failure.
  let matched: McpResourceReadResult['contents'][number] | undefined
  try {
    const res = await mcp.readResource(uiUri)
    // Emit ONLY the content whose uri matches the requested `uiUri`. A source
    // can return unrelated contents; falling back to `contents[0]` would risk
    // rendering a widget that doesn't correspond to the linked resource. This
    // is a display widget — a mismatched resource is worse than none, so if no
    // content matches we fail-soft (warn + return) rather than emit.
    matched = res.contents.find((c) => c.uri === uiUri)
  } catch (err) {
    // fail-soft — the text tool-result already flows; a broken widget must
    // not break the run.
    console.warn(`[mcp-apps] failed to read ui resource ${uiUri}:`, err)
    return
  }
  if (!matched) {
    console.warn(
      `[mcp-apps] ui resource ${uiUri} returned no content matching that uri; not emitting`,
    )
    return
  }
  // NOTE: `toolCallId` is intentionally NOT set here — it is stamped onto
  // every emitted event by the `executeToolCalls` context wrapper, so the
  // UIResourceEvent.value.toolCallId / UIResourcePart.toolCallId contract is
  // still satisfied downstream.
  context.emitCustomEvent('ui-resource', {
    resource: {
      uri: matched.uri,
      mimeType: matched.mimeType ?? 'text/html',
      text: matched.text,
      blob: matched.blob,
    },
    serverId: mcp.serverId,
    toolName: mcp.serverToolName ?? tool.name,
    meta: undefined,
  })
}

/**
 * Optional middleware hooks for tool execution.
 * When provided, these callbacks are invoked before/after each tool execution.
 */
export interface ToolExecutionMiddlewareHooks {
  onBeforeToolCall?: (
    toolCall: ToolCall,
    tool: Tool | undefined,
    args: unknown,
  ) => Promise<BeforeToolCallDecision>
  onAfterToolCall?: (info: AfterToolCallInfo) => Promise<void>
}

/**
 * Error thrown when middleware decides to abort the chat run during tool execution.
 */
export class MiddlewareAbortError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'MiddlewareAbortError'
  }
}

// The leaf context-inference primitives (ContextFromTool, MergeContext,
// UnionToIntersection, DefinedContext) are shared with the chat activity
// options layer — see ../runtime-context-types.
type RequiredContextFromToolUnion<T> = T extends unknown
  ? undefined extends ContextFromTool<T>
    ? never
    : ContextFromTool<T>
  : never

type ContextFromToolUnion<T> = [
  UnionToIntersection<DefinedContext<ContextFromTool<T>>>,
] extends [never]
  ? unknown
  : [RequiredContextFromToolUnion<T>] extends [never]
    ? UnionToIntersection<DefinedContext<ContextFromTool<T>>> | undefined
    : UnionToIntersection<DefinedContext<ContextFromTool<T>>>

type ContextFromTools<TTools> = TTools extends readonly [
  infer THead,
  ...infer TTail,
]
  ? MergeContext<ContextFromTool<THead>, ContextFromTools<TTail>>
  : TTools extends ReadonlyArray<infer TTool>
    ? ContextFromToolUnion<TTool>
    : unknown

type ExecuteToolsContextArgs<TContext> = undefined extends TContext
  ? [userContext?: TContext]
  : [userContext: TContext]

/**
 * Manages tool call accumulation and execution for the chat() method's automatic tool execution loop.
 *
 * Responsibilities:
 * - Accumulates streaming tool call events (ID, name, arguments)
 * - Validates tool calls (filters out incomplete ones)
 * - Executes tool `execute` functions with parsed arguments
 * - Emits `TOOL_CALL_END` events for client visibility
 * - Returns tool result messages for conversation history
 *
 * This class is used internally by the AI.chat() method to handle the automatic
 * tool execution loop. It can also be used independently for custom tool execution logic.
 *
 * @example
 * ```typescript
 * const manager = new ToolCallManager(tools);
 *
 * // During streaming, accumulate tool calls
 * for await (const chunk of stream) {
 *   if (chunk.type === 'TOOL_CALL_START') {
 *     manager.addToolCallStartEvent(chunk);
 *   } else if (chunk.type === 'TOOL_CALL_ARGS') {
 *     manager.addToolCallArgsEvent(chunk);
 *   }
 * }
 *
 * // After stream completes, execute tools
 * if (manager.hasToolCalls()) {
 *   const toolResults = yield* manager.executeTools(finishEvent);
 *   messages = [...messages, ...toolResults];
 *   manager.clear();
 * }
 * ```
 */
export class ToolCallManager<
  TToolsOrContext = ReadonlyArray<AnyTool>,
  TContext = TToolsOrContext extends ReadonlyArray<AnyTool>
    ? ContextFromTools<TToolsOrContext>
    : TToolsOrContext,
> {
  private readonly toolCallsMap = new Map<number, ToolCall>()
  private readonly tools: TToolsOrContext extends ReadonlyArray<AnyTool>
    ? TToolsOrContext
    : ReadonlyArray<AnyTool>

  constructor(
    tools: TToolsOrContext extends ReadonlyArray<AnyTool>
      ? TToolsOrContext
      : ReadonlyArray<AnyTool>,
  ) {
    this.tools = tools
  }

  /**
   * Add a TOOL_CALL_START event to begin tracking a tool call (AG-UI)
   */
  addToolCallStartEvent(event: ToolCallStartEvent): void {
    const index = event.index ?? this.toolCallsMap.size
    const runtimeEvent = event as Partial<ToolCallStartEvent> &
      Pick<ToolCallStartEvent, 'toolName'>
    const name = runtimeEvent.toolCallName ?? runtimeEvent.toolName
    this.toolCallsMap.set(index, {
      id: event.toolCallId,
      type: 'function',
      function: {
        name,
        arguments: '',
      },
      ...(event.metadata !== undefined && { metadata: event.metadata }),
    })
  }

  /**
   * Add a TOOL_CALL_ARGS event to accumulate arguments (AG-UI)
   */
  addToolCallArgsEvent(event: ToolCallArgsEvent): void {
    // Find the tool call by ID
    for (const [, toolCall] of this.toolCallsMap.entries()) {
      if (toolCall.id === event.toolCallId) {
        toolCall.function.arguments += event.delta
        break
      }
    }
  }

  /**
   * Complete a tool call with its final input
   * Called when TOOL_CALL_END is received
   */
  completeToolCall(event: ToolCallEndEvent): void {
    for (const [, toolCall] of this.toolCallsMap.entries()) {
      if (toolCall.id === event.toolCallId) {
        if (event.input !== undefined) {
          // Normalize null/non-object to {} (e.g. Anthropic empty tool_use blocks)
          const normalized =
            event.input && typeof event.input === 'object' ? event.input : {}
          toolCall.function.arguments = JSON.stringify(normalized)
        }
        break
      }
    }
  }

  /**
   * Check if there are any complete tool calls to execute
   */
  hasToolCalls(): boolean {
    return this.getToolCalls().length > 0
  }

  /**
   * Get all complete tool calls (filtered for valid ID and name)
   */
  getToolCalls(): Array<ToolCall> {
    return Array.from(this.toolCallsMap.values()).filter(
      (tc) => tc.id && tc.function.name && tc.function.name.trim().length > 0,
    )
  }

  /**
   * Execute all tool calls and return tool result messages
   * Yields TOOL_CALL_END events for streaming
   * @param finishEvent - RUN_FINISHED event from the stream
   */
  async *executeTools(
    finishEvent: RunFinishedEvent,
    ...contextArgs: ExecuteToolsContextArgs<TContext>
  ): AsyncGenerator<ToolCallEndEvent, Array<ModelMessage>, void> {
    const toolCallsArray = this.getToolCalls()
    const toolResults: Array<ModelMessage> = []
    const hasRuntimeContext = contextArgs.length > 0
    const userContext = contextArgs[0]

    for (const toolCall of toolCallsArray) {
      const tool = this.tools.find((t) => t.name === toolCall.function.name)

      let toolResultContent: string | Array<ContentPart>
      let toolResultState: ToolOutputState | undefined
      // Holds the parsed/validated execution output before serialization.
      // Surfaced on the emitted `TOOL_CALL_END` event as `output` so
      // consumers can read it typed (via `TypedStreamChunk` distribution
      // over the tools array) without re-parsing `result`.
      // Stays `undefined` when the tool has no `execute` (client-only
      // tools) or when execution throws.
      let toolOutput: unknown
      if (tool?.execute) {
        try {
          // Parse arguments (normalize null/non-object to {} for empty tool_use blocks)
          let args: unknown
          try {
            const argsString = toolCall.function.arguments.trim() || '{}'
            const parsed = JSON.parse(argsString)
            args = parsed && typeof parsed === 'object' ? parsed : {}
          } catch (parseError) {
            throw new Error(
              `Failed to parse tool arguments as JSON: ${toolCall.function.arguments}`,
            )
          }

          // Validate input against inputSchema (for Standard Schema compliant schemas)
          if (tool.inputSchema && isStandardSchema(tool.inputSchema)) {
            try {
              args = parseWithStandardSchema(tool.inputSchema, args)
            } catch (validationError: unknown) {
              const message =
                validationError instanceof Error
                  ? validationError.message
                  : 'Validation failed'
              throw new Error(
                `Input validation failed for tool ${tool.name}: ${message}`,
              )
            }
          }

          // Execute the tool
          const executionContext = {
            toolCallId: toolCall.id,
            context: userContext,
            emitCustomEvent: () => {},
          } as ToolExecutionContext<TContext>
          let result = hasRuntimeContext
            ? await tool.execute(args, executionContext)
            : await tool.execute(args)

          // Validate output against outputSchema if provided (for Standard
          // Schema compliant schemas). Unlike the previous implementation we
          // intentionally validate `undefined`/`null` results too, so a tool
          // whose schema forbids them surfaces a validation error instead of
          // silently passing — the schema itself decides whether they're valid.
          if (tool.outputSchema && isStandardSchema(tool.outputSchema)) {
            try {
              result = parseWithStandardSchema(tool.outputSchema, result)
            } catch (validationError: unknown) {
              const message =
                validationError instanceof Error
                  ? validationError.message
                  : 'Validation failed'
              throw new Error(
                `Output validation failed for tool ${tool.name}: ${message}`,
              )
            }
          }

          toolOutput = result
          toolResultContent = normalizeToolResult(result)
        } catch (error: unknown) {
          // If tool execution fails, add error message
          const message =
            error instanceof Error ? error.message : 'Unknown error'
          toolResultContent = `Error executing tool: ${message}`
          toolResultState = 'output-error'
        }
      } else {
        // Tool doesn't have execute function, add placeholder
        toolResultContent = `Tool ${toolCall.function.name} does not have an execute function`
      }

      // Emit TOOL_CALL_END event
      yield {
        type: 'TOOL_CALL_END',
        toolCallId: toolCall.id,
        toolCallName: toolCall.function.name,
        toolName: toolCall.function.name,
        model: finishEvent.model,
        timestamp: Date.now(),
        // Typed parsed output (undefined for failed exec / client-only tools).
        ...(toolOutput !== undefined ? { output: toolOutput } : {}),
        result: toolResultContent,
        ...(toolResultState !== undefined && { state: toolResultState }),
      }

      // Add tool result message
      toolResults.push({
        role: 'tool',
        content: toolResultContent,
        toolCallId: toolCall.id,
      })
    }

    return toolResults
  }

  /**
   * Clear the tool calls map for the next iteration
   */
  clear(): void {
    this.toolCallsMap.clear()
  }
}

export interface ToolResult {
  toolCallId: string
  toolName: string
  result: any
  state?: 'output-available' | 'output-error'
  /** Duration of tool execution in milliseconds (only for server-executed tools) */
  duration?: number
  /**
   * Parsed tool input (after JSON parse + optional Standard Schema validation).
   * Surfaced on engine-emitted `TOOL_CALL_END` events for TypedStreamChunk consumers.
   */
  input?: unknown
  /**
   * Parsed tool output before wire serialization. Surfaced on engine-emitted
   * `TOOL_CALL_END` events so consumers can read typed `output` without
   * re-parsing `result`. Undefined on error paths and when execution is skipped.
   */
  output?: unknown
}

export interface ApprovalRequest {
  toolCallId: string
  toolName: string
  input: any
  approvalId: string
}

export interface ClientToolRequest {
  toolCallId: string
  toolName: string
  input: any
}

export interface ToolResumeExecutionState {
  deniedToolResults?: ReadonlyMap<string, unknown>
  cancelledToolCallIds?: ReadonlySet<string>
}

function approvalResolution(
  approvals: ReadonlyMap<string, ToolApprovalResolution>,
  toolCallId: string,
): ToolApprovalResolution | undefined {
  return approvals.get(toolCallId) ?? approvals.get(`approval_${toolCallId}`)
}

function isApproved(resolution: ToolApprovalResolution): boolean {
  return typeof resolution === 'boolean' ? resolution : resolution.approved
}

function editedApprovalArgs(
  resolution: ToolApprovalResolution,
): unknown | undefined {
  return typeof resolution === 'object' && resolution.approved
    ? resolution.editedArgs
    : undefined
}

function deniedApprovalResult(resolution: ToolApprovalResolution): unknown {
  return typeof resolution === 'object' && !resolution.approved
    ? (resolution.payload ?? { error: 'User declined tool execution' })
    : { error: 'User declined tool execution' }
}

interface ExecuteToolCallsResult {
  /** Tool results ready to send to LLM */
  results: Array<ToolResult>
  /** Tools that need user approval before execution */
  needsApproval: Array<ApprovalRequest>
  /** Tools that need client-side execution */
  needsClientExecution: Array<ClientToolRequest>
}

/**
 * Helper that runs a tool execution promise while polling for pending custom events.
 * Yields any custom events that are emitted during execution, then returns the
 * execution result.
 */
async function* executeWithEventPolling<T>(
  executionPromise: Promise<T>,
  pendingEvents: Array<CustomEvent>,
): AsyncGenerator<CustomEvent, T, void> {
  // Use an object to track mutable state across the async boundary
  const state = { done: false, result: undefined as T }
  const executionWithFlag = executionPromise.then((r) => {
    state.done = true
    state.result = r
    return r
  })

  while (!state.done) {
    // Wait for either the execution to complete or a short timeout
    await Promise.race([
      executionWithFlag,
      new Promise((resolve) => setTimeout(resolve, 10)),
    ])

    // Flush any pending events
    let event: CustomEvent | undefined
    while ((event = pendingEvents.shift()) !== undefined) {
      yield event
    }
  }

  // Final flush in case events were emitted right at completion
  let event: CustomEvent | undefined
  while ((event = pendingEvents.shift()) !== undefined) {
    yield event
  }

  return state.result
}

/**
 * Apply a middleware onBeforeToolCall decision.
 * Returns the (possibly transformed) input if execution should proceed,
 * or undefined if the tool call was skipped (result already pushed).
 * Throws MiddlewareAbortError if the decision is 'abort'.
 */
async function applyBeforeToolCallDecision(
  toolCall: ToolCall,
  tool: Tool,
  input: unknown,
  toolName: string,
  middlewareHooks: ToolExecutionMiddlewareHooks,
  results: Array<ToolResult>,
): Promise<{ proceed: true; input: unknown } | { proceed: false }> {
  if (!middlewareHooks.onBeforeToolCall) {
    return { proceed: true, input }
  }

  const decision = await middlewareHooks.onBeforeToolCall(toolCall, tool, input)
  if (!decision) {
    return { proceed: true, input }
  }

  if (decision.type === 'abort') {
    throw new MiddlewareAbortError(decision.reason || 'Aborted by middleware')
  }

  if (decision.type === 'skip') {
    const skipResult = decision.result
    results.push({
      toolCallId: toolCall.id,
      toolName,
      result:
        typeof skipResult === 'string'
          ? safeJsonParse(skipResult)
          : (skipResult ?? null),
      duration: 0,
    })
    if (middlewareHooks.onAfterToolCall) {
      await middlewareHooks.onAfterToolCall({
        toolCall,
        tool,
        toolName,
        toolCallId: toolCall.id,
        ok: true,
        duration: 0,
        result: skipResult,
      })
    }
    return { proceed: false }
  }

  return { proceed: true, input: decision.args }
}

/**
 * Execute a server-side tool with event polling, output validation, and middleware hooks.
 * Yields CustomEvent chunks during execution and pushes the result to the results array.
 */
export async function* executeServerTool<TContext = unknown>(
  toolCall: ToolCall,
  tool: AnyTool,
  toolName: string,
  input: unknown,
  context: ToolExecutionContext<TContext>,
  pendingEvents: Array<CustomEvent>,
  results: Array<ToolResult>,
  middlewareHooks?: ToolExecutionMiddlewareHooks,
): AsyncGenerator<CustomEvent, void, void> {
  const startTime = Date.now()
  try {
    if (!tool.execute) {
      throw new Error(`Tool ${toolName} has no execute() implementation`)
    }
    const executionPromise = Promise.resolve(tool.execute(input, context))
    let result = yield* executeWithEventPolling(executionPromise, pendingEvents)
    const duration = Date.now() - startTime

    // MCP Apps: if this tool links a ui:// resource, eagerly read it and queue
    // a `ui-resource` CUSTOM event. The MCP source stays live until the run
    // drains (MCPManager's `connection:'close'` policy disposes on completion),
    // so `readResource` is callable here. Fail-soft: a read error warns and
    // emits nothing — the text result still flows.
    await emitUiResourceIfLinked(tool, context)

    // Flush remaining events (including any queued ui-resource event)
    let pendingEvent: CustomEvent | undefined
    while ((pendingEvent = pendingEvents.shift()) !== undefined) {
      yield pendingEvent
    }

    // Validate output against outputSchema if provided. Validates
    // `undefined`/`null` too — the schema decides whether they're valid.
    if (tool.outputSchema && isStandardSchema(tool.outputSchema)) {
      result = parseWithStandardSchema(tool.outputSchema, result)
    }

    const finalResult =
      typeof result === 'string' ? safeJsonParse(result) : (result ?? null)

    results.push({
      toolCallId: toolCall.id,
      toolName,
      result: finalResult,
      input,
      output: finalResult,
      duration,
    })

    if (middlewareHooks?.onAfterToolCall) {
      await middlewareHooks.onAfterToolCall({
        toolCall,
        tool,
        toolName,
        toolCallId: toolCall.id,
        ok: true,
        duration,
        result: finalResult,
      })
    }
  } catch (error: unknown) {
    const duration = Date.now() - startTime

    // Flush remaining events
    let pendingEvent: CustomEvent | undefined
    while ((pendingEvent = pendingEvents.shift()) !== undefined) {
      yield pendingEvent
    }

    if (error instanceof MiddlewareAbortError) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    results.push({
      toolCallId: toolCall.id,
      toolName,
      result: { error: message },
      input,
      state: 'output-error',
      duration,
    })

    if (middlewareHooks?.onAfterToolCall) {
      await middlewareHooks.onAfterToolCall({
        toolCall,
        tool,
        toolName,
        toolCallId: toolCall.id,
        ok: false,
        duration,
        error,
      })
    }
  }
}

function buildClientToolResult(
  toolCallId: string,
  toolName: string,
  tool: AnyTool,
  rawResult: unknown,
  input?: unknown,
): ToolResult {
  try {
    let result = rawResult
    if (tool.outputSchema && isStandardSchema(tool.outputSchema)) {
      result = parseWithStandardSchema(tool.outputSchema, result)
    }

    const parsed =
      typeof result === 'string' ? safeJsonParse(result) : (result ?? null)
    return {
      toolCallId,
      toolName,
      result: parsed,
      input,
      output: parsed,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Validation failed'
    return {
      toolCallId,
      toolName,
      result: { error: message },
      input,
      state: 'output-error',
    }
  }
}

/**
 * Execute tool calls based on their configuration.
 * Yields CustomEvent chunks during tool execution for real-time progress updates.
 *
 * Handles three cases:
 * 1. Client tools (no execute) - request client to execute
 * 2. Server tools with approval - check approval before executing
 * 3. Normal server tools - execute immediately
 *
 * @param toolCalls - Tool calls from the LLM
 * @param tools - Available tools with their configurations
 * @param approvals - Map keyed by toolCallId (or `approval_${toolCallId}`) → ToolApprovalResolution
 * @param clientResults - Map of client-side execution results (toolCallId -> result)
 * @param createCustomEventChunk - Factory to create CustomEvent chunks (optional)
 */
export async function* executeToolCalls<TContext = unknown>(
  toolCalls: Array<ToolCall>,
  tools: ReadonlyArray<AnyTool>,
  approvals: Map<string, ToolApprovalResolution> = new Map(),
  clientResults: Map<string, any> = new Map(),
  createCustomEventChunk?: (
    eventName: string,
    value: Record<string, any>,
  ) => CustomEvent,
  middlewareHooks?: ToolExecutionMiddlewareHooks,
  userContext?: TContext,
  abortSignal?: AbortSignal,
  resumeState?: ToolResumeExecutionState,
): AsyncGenerator<CustomEvent, ExecuteToolCallsResult, void> {
  const results: Array<ToolResult> = []
  const needsApproval: Array<ApprovalRequest> = []
  const needsClientExecution: Array<ClientToolRequest> = []

  // Create tool lookup map
  const toolMap = new Map<string, AnyTool>()
  for (const tool of tools) {
    toolMap.set(tool.name, tool)
  }

  // Batch gating: when any tool in the batch still needs an approval decision,
  // defer all execution so side effects don't happen before the user decides.
  const hasPendingApprovals = toolCalls.some((tc) => {
    const t = toolMap.get(tc.function.name)
    return (
      t?.needsApproval &&
      approvalResolution(approvals, tc.id) === undefined &&
      !resumeState?.cancelledToolCallIds?.has(tc.id)
    )
  })

  for (const toolCall of toolCalls) {
    const tool = toolMap.get(toolCall.function.name)
    const toolName = toolCall.function.name

    if (!tool) {
      // Unknown tool - return error
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: { error: `Unknown tool: ${toolName}` },
        state: 'output-error',
      })
      continue
    }

    // Skip non-pending tools while approvals are outstanding
    if (hasPendingApprovals) {
      const isPendingApproval =
        tool.needsApproval &&
        approvalResolution(approvals, toolCall.id) === undefined
      const isPlainClientRequest = !tool.needsApproval && !tool.execute
      if (!isPendingApproval && !isPlainClientRequest) {
        continue
      }
    }

    if (resumeState?.cancelledToolCallIds?.has(toolCall.id)) {
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result: { error: 'Tool execution cancelled' },
        state: 'output-error',
      })
      continue
    }

    // Parse arguments, throwing error if invalid JSON
    let input: unknown = {}
    const argsStr = toolCall.function.arguments.trim() || '{}'
    if (argsStr) {
      try {
        const parsed = JSON.parse(argsStr)
        // Normalize null/non-object to {} (e.g. Anthropic empty tool_use blocks)
        input = parsed && typeof parsed === 'object' ? parsed : {}
      } catch (parseError) {
        // If parsing fails, throw error to fail fast
        throw new Error(`Failed to parse tool arguments as JSON: ${argsStr}`)
      }
    }

    // Validate input against inputSchema (for Standard Schema compliant schemas)
    if (tool.inputSchema && isStandardSchema(tool.inputSchema)) {
      try {
        input = parseWithStandardSchema(tool.inputSchema, input)
      } catch (validationError: unknown) {
        const message =
          validationError instanceof Error
            ? validationError.message
            : 'Validation failed'
        results.push({
          toolCallId: toolCall.id,
          toolName,
          result: {
            error: `Input validation failed for tool ${tool.name}: ${message}`,
          },
          // raw parse may have failed validation — still attach best-effort input
          input,
          state: 'output-error',
        })
        continue
      }
    }

    // Create a ToolExecutionContext for this tool call with event emission
    const pendingEvents: Array<CustomEvent> = []
    const context = {
      toolCallId: toolCall.id,
      context: userContext,
      abortSignal,
      emitCustomEvent: (eventName: string, value: Record<string, any>) => {
        if (createCustomEventChunk) {
          pendingEvents.push(
            createCustomEventChunk(eventName, {
              ...value,
              toolCallId: toolCall.id,
            }),
          )
        }
      },
    } as ToolExecutionContext<TContext>

    // CASE 1: Client-side tool (no execute function)
    if (!tool.execute) {
      // Check if tool needs approval
      if (tool.needsApproval) {
        const approvalId = `approval_${toolCall.id}`
        const resolution = approvalResolution(approvals, toolCall.id)

        // Check if approval decision exists
        if (resolution !== undefined) {
          const approved = isApproved(resolution)

          if (approved) {
            input = editedApprovalArgs(resolution) ?? input
            // Approved - check if client has executed
            if (clientResults.has(toolCall.id)) {
              results.push(
                buildClientToolResult(
                  toolCall.id,
                  toolName,
                  tool,
                  clientResults.get(toolCall.id),
                  input,
                ),
              )
            } else {
              // Approved but not executed yet - request client execution
              needsClientExecution.push({
                toolCallId: toolCall.id,
                toolName,
                input,
              })
            }
          } else {
            // User declined
            results.push({
              toolCallId: toolCall.id,
              toolName,
              result:
                resumeState?.deniedToolResults?.get(toolCall.id) ??
                deniedApprovalResult(resolution),
              input,
              state: 'output-error',
            })
          }
        } else {
          // Need approval first
          needsApproval.push({
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            input,
            approvalId,
          })
        }
      } else {
        // No approval needed - check if client has executed
        if (clientResults.has(toolCall.id)) {
          results.push(
            buildClientToolResult(
              toolCall.id,
              toolName,
              tool,
              clientResults.get(toolCall.id),
              input,
            ),
          )
        } else {
          // Request client execution
          needsClientExecution.push({
            toolCallId: toolCall.id,
            toolName,
            input,
          })
        }
      }
      continue
    }

    // CASE 2: Server tool with approval required
    if (tool.needsApproval) {
      const approvalId = `approval_${toolCall.id}`
      const resolution = approvalResolution(approvals, toolCall.id)

      // Check if approval decision exists
      if (resolution !== undefined) {
        const approved = isApproved(resolution)

        if (approved) {
          input = editedApprovalArgs(resolution) ?? input
          // Apply middleware before-hook for approved tools
          if (middlewareHooks) {
            const decision = await applyBeforeToolCallDecision(
              toolCall,
              tool,
              input,
              toolName,
              middlewareHooks,
              results,
            )
            if (!decision.proceed) continue
            input = decision.input
          }

          yield* executeServerTool(
            toolCall,
            tool,
            toolName,
            input,
            context,
            pendingEvents,
            results,
            middlewareHooks,
          )
        } else {
          // User declined
          results.push({
            toolCallId: toolCall.id,
            toolName,
            result:
              resumeState?.deniedToolResults?.get(toolCall.id) ??
              deniedApprovalResult(resolution),
            input,
            state: 'output-error',
          })
        }
      } else {
        // Need approval
        needsApproval.push({
          toolCallId: toolCall.id,
          toolName,
          input,
          approvalId,
        })
      }
      continue
    }

    // CASE 3: Normal server tool - execute immediately
    if (middlewareHooks) {
      const decision = await applyBeforeToolCallDecision(
        toolCall,
        tool,
        input,
        toolName,
        middlewareHooks,
        results,
      )
      if (!decision.proceed) continue
      input = decision.input
    }

    yield* executeServerTool(
      toolCall,
      tool,
      toolName,
      input,
      context,
      pendingEvents,
      results,
      middlewareHooks,
    )
  }

  return { results, needsApproval, needsClientExecution }
}
