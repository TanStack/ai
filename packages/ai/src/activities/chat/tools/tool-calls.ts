import { normalizeToolResult } from '../../../utilities/tool-result'
import { tanstackMetadata } from '../../../utilities/merge-metadata'
import type { AdapterYieldChunk } from '../../../utilities/adapter-yield-chunk'
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

async function emitUiResourceIfLinked<TContext>(
  tool: AnyTool,
  context: ToolExecutionContext<TContext>,
): Promise<void> {
  const mcp = readMcpAppMeta(tool)
  const uiUri = mcp?.uiResourceUri
  const shouldSkipUiUri = !uiUri || !mcp.readResource
  if (shouldSkipUiUri) return

  // The try covers ONLY the fallible read — keep `emitCustomEvent` out of it so
  // an exception from the emit path can't be mislabeled as a read failure.
  let matched: McpResourceReadResult['contents'][number] | undefined
  try {
    const res = await mcp.readResource(uiUri)
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

export interface ToolExecutionMiddlewareHooks {
  onBeforeToolCall?: (
    toolCall: ToolCall,
    tool: Tool | undefined,
    args: unknown,
  ) => Promise<BeforeToolCallDecision>
  onAfterToolCall?: (info: AfterToolCallInfo) => Promise<void>
}

export class MiddlewareAbortError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'MiddlewareAbortError'
  }
}

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

function parseManagedToolArgs(tool: AnyTool, toolCall: ToolCall): unknown {
  const argsString = toolCall.function.arguments.trim() || '{}'
  let args: unknown
  try {
    const parsed = JSON.parse(argsString)
    args = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    throw new Error(
      `Failed to parse tool arguments as JSON: ${toolCall.function.arguments}`,
    )
  }
  const shouldSkipTool =
    !tool.inputSchema || !isStandardSchema(tool.inputSchema)
  if (shouldSkipTool) return args
  try {
    return parseWithStandardSchema(tool.inputSchema, args)
  } catch (validationError: unknown) {
    const message =
      validationError instanceof Error
        ? validationError.message
        : 'Validation failed'
    throw new Error(`Input validation failed for tool ${tool.name}: ${message}`)
  }
}

function validateManagedToolOutput(tool: AnyTool, result: unknown): unknown {
  const shouldSkipTool =
    !tool.outputSchema || !isStandardSchema(tool.outputSchema)
  if (shouldSkipTool) return result
  try {
    return parseWithStandardSchema(tool.outputSchema, result)
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

async function executeManagedToolCall<TContext>(
  tool: AnyTool | undefined,
  toolCall: ToolCall,
  hasRuntimeContext: boolean,
  userContext: TContext | undefined,
): Promise<{
  content: string | Array<ContentPart>
  state?: ToolOutputState
  output?: unknown
}> {
  if (!tool?.execute) {
    return {
      content: `Tool ${toolCall.function.name} does not have an execute function`,
    }
  }
  try {
    const args = parseManagedToolArgs(tool, toolCall)
    const executionContext = {
      toolCallId: toolCall.id,
      context: userContext,
      emitCustomEvent: () => {},
    } as ToolExecutionContext<TContext>
    let result = hasRuntimeContext
      ? await tool.execute(args, executionContext)
      : await tool.execute(args)
    result = validateManagedToolOutput(tool, result)
    return { content: normalizeToolResult(result), output: result }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      content: `Error executing tool: ${message}`,
      state: 'output-error',
    }
  }
}

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

  addToolCallStartEvent(event: ToolCallStartEvent): void {
    const index = (event as AdapterYieldChunk).index ?? this.toolCallsMap.size
    const name = event.toolCallName ?? event.toolName
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

  addToolCallArgsEvent(event: ToolCallArgsEvent): void {
    const extra = event as AdapterYieldChunk
    const toolCallsMapEntries = this.toolCallsMap.entries()
    for (const [, toolCall] of toolCallsMapEntries) {
      if (toolCall.id === event.toolCallId) {
        const isInvalidExtra =
          typeof extra.args === 'string' && extra.args !== ''
        if (isInvalidExtra) {
          toolCall.function.arguments = extra.args
        } else {
          toolCall.function.arguments += event.delta
        }
        break
      }
    }
  }

  completeToolCall(event: ToolCallEndEvent): void {
    const toolCallsMap = this.toolCallsMap.values()
    for (const toolCall of toolCallsMap) {
      if (toolCall.id !== event.toolCallId) continue
      if (event.input === undefined) return
      const normalized =
        event.input && typeof event.input === 'object' ? event.input : {}
      toolCall.function.arguments = JSON.stringify(normalized)
      return
    }
  }

  hasToolCalls(): boolean {
    return this.getToolCalls().length > 0
  }

  getToolCalls(): Array<ToolCall> {
    return Array.from(this.toolCallsMap.values()).filter(
      (tc) => tc.id && tc.function.name && tc.function.name.trim().length > 0,
    )
  }

  async *executeTools(
    finishEvent: RunFinishedEvent,
    ...contextArgs: ExecuteToolsContextArgs<TContext>
  ): AsyncGenerator<AdapterYieldChunk, Array<ModelMessage>, void> {
    const toolCallsArray = this.getToolCalls()
    const toolResults: Array<ModelMessage> = []
    const hasRuntimeContext = contextArgs.length > 0
    const userContext = contextArgs[0]

    for (const toolCall of toolCallsArray) {
      const tool = this.tools.find((t) => t.name === toolCall.function.name)

      const executed = await executeManagedToolCall(
        tool,
        toolCall,
        hasRuntimeContext,
        userContext,
      )
      const toolResultContent = executed.content
      const toolResultState = executed.state
      const toolOutput = executed.output

      // Emit TOOL_CALL_END event
      yield {
        type: 'TOOL_CALL_END',
        toolCallId: toolCall.id,
        toolCallName: toolCall.function.name,
        toolName: toolCall.function.name,
        model: (() => {
          const model = tanstackMetadata(finishEvent)?.model
          return typeof model === 'string' ? model : undefined
        })(),
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
  input?: unknown
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

    await emitUiResourceIfLinked(tool, context)

    // Flush remaining events (including any queued ui-resource event)
    let pendingEvent: CustomEvent | undefined
    while ((pendingEvent = pendingEvents.shift()) !== undefined) {
      yield pendingEvent
    }

    // Validate output against outputSchema if provided. Validates
    // `undefined`/`null` too — the schema decides whether they're valid.
    const hasTool = tool.outputSchema && isStandardSchema(tool.outputSchema)
    if (hasTool) {
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
    const hasTool = tool.outputSchema && isStandardSchema(tool.outputSchema)
    if (hasTool) {
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

function parseExecuteToolCallInput(
  tool: AnyTool,
  toolCall: ToolCall,
  toolName: string,
): { ok: true; input: unknown } | { ok: false; result: ToolResult } {
  let input: unknown = {}
  const argsStr = toolCall.function.arguments.trim() || '{}'
  if (argsStr) {
    try {
      const parsed = JSON.parse(argsStr)
      input = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {
        ok: false,
        result: {
          toolCallId: toolCall.id,
          toolName,
          result: {
            error: `Failed to parse tool arguments as JSON: ${argsStr}`,
          },
          input,
          state: 'output-error',
        },
      }
    }
  }
  const shouldSkipTool =
    !tool.inputSchema || !isStandardSchema(tool.inputSchema)
  if (shouldSkipTool) {
    return { ok: true, input }
  }
  try {
    return { ok: true, input: parseWithStandardSchema(tool.inputSchema, input) }
  } catch (validationError: unknown) {
    const message =
      validationError instanceof Error
        ? validationError.message
        : 'Validation failed'
    return {
      ok: false,
      result: {
        toolCallId: toolCall.id,
        toolName,
        result: {
          error: `Input validation failed for tool ${tool.name}: ${message}`,
        },
        input,
        state: 'output-error',
      },
    }
  }
}

function handleClientToolCall(input: {
  tool: AnyTool
  toolCall: ToolCall
  toolName: string
  parsedInput: unknown
  approvals: Map<string, ToolApprovalResolution>
  clientResults: Map<string, any>
  resumeState?: ToolResumeExecutionState
  results: Array<ToolResult>
  needsApproval: Array<ApprovalRequest>
  needsClientExecution: Array<ClientToolRequest>
}): void {
  const {
    tool,
    toolCall,
    toolName,
    approvals,
    clientResults,
    resumeState,
    results,
    needsApproval,
    needsClientExecution,
  } = input
  let parsedInput = input.parsedInput
  if (!tool.needsApproval) {
    if (clientResults.has(toolCall.id)) {
      results.push(
        buildClientToolResult(
          toolCall.id,
          toolName,
          tool,
          clientResults.get(toolCall.id),
          parsedInput,
        ),
      )
      return
    }
    needsClientExecution.push({
      toolCallId: toolCall.id,
      toolName,
      input: parsedInput,
    })
    return
  }
  const approvalId = `approval_${toolCall.id}`
  const resolution = approvalResolution(approvals, toolCall.id)
  if (resolution === undefined) {
    needsApproval.push({
      toolCallId: toolCall.id,
      toolName: toolCall.function.name,
      input: parsedInput,
      approvalId,
    })
    return
  }
  if (!isApproved(resolution)) {
    results.push({
      toolCallId: toolCall.id,
      toolName,
      result:
        resumeState?.deniedToolResults?.get(toolCall.id) ??
        deniedApprovalResult(resolution),
      input: parsedInput,
      state: 'output-error',
    })
    return
  }
  parsedInput = editedApprovalArgs(resolution) ?? parsedInput
  if (clientResults.has(toolCall.id)) {
    results.push(
      buildClientToolResult(
        toolCall.id,
        toolName,
        tool,
        clientResults.get(toolCall.id),
        parsedInput,
      ),
    )
    return
  }
  needsClientExecution.push({
    toolCallId: toolCall.id,
    toolName,
    input: parsedInput,
  })
}

async function* handleServerToolCall<TContext>(input: {
  tool: AnyTool
  toolCall: ToolCall
  toolName: string
  parsedInput: unknown
  approvals: Map<string, ToolApprovalResolution>
  resumeState?: ToolResumeExecutionState
  middlewareHooks?: ToolExecutionMiddlewareHooks
  context: ToolExecutionContext<TContext>
  pendingEvents: Array<CustomEvent>
  results: Array<ToolResult>
  needsApproval: Array<ApprovalRequest>
}): AsyncGenerator<CustomEvent, void, void> {
  const {
    tool,
    toolCall,
    toolName,
    approvals,
    resumeState,
    middlewareHooks,
    context,
    pendingEvents,
    results,
    needsApproval,
  } = input
  let parsedInput = input.parsedInput
  if (tool.needsApproval) {
    const approvalId = `approval_${toolCall.id}`
    const resolution = approvalResolution(approvals, toolCall.id)
    if (resolution === undefined) {
      needsApproval.push({
        toolCallId: toolCall.id,
        toolName,
        input: parsedInput,
        approvalId,
      })
      return
    }
    if (!isApproved(resolution)) {
      results.push({
        toolCallId: toolCall.id,
        toolName,
        result:
          resumeState?.deniedToolResults?.get(toolCall.id) ??
          deniedApprovalResult(resolution),
        input: parsedInput,
        state: 'output-error',
      })
      return
    }
    parsedInput = editedApprovalArgs(resolution) ?? parsedInput
  }
  if (middlewareHooks) {
    const decision = await applyBeforeToolCallDecision(
      toolCall,
      tool,
      parsedInput,
      toolName,
      middlewareHooks,
      results,
    )
    if (!decision.proceed) return
    parsedInput = decision.input
  }
  yield* executeServerTool(
    toolCall,
    tool,
    toolName,
    parsedInput,
    context,
    pendingEvents,
    results,
    middlewareHooks,
  )
}

function shouldSkipToolWhileApprovalsPending(
  tool: AnyTool,
  toolCall: ToolCall,
  approvals: Map<string, ToolApprovalResolution>,
  hasPendingApprovals: boolean,
): boolean {
  if (!hasPendingApprovals) return false
  const isPendingApproval =
    Boolean(tool.needsApproval) &&
    approvalResolution(approvals, toolCall.id) === undefined
  const isPlainClientRequest = !tool.needsApproval && !tool.execute
  return !isPendingApproval && !isPlainClientRequest
}

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
  const toolMap = new Map<string, AnyTool>()
  for (const tool of tools) {
    toolMap.set(tool.name, tool)
  }

  const hasPendingApprovals = toolCalls.some((tc) => {
    const t = toolMap.get(tc.function.name)
    return (
      Boolean(t?.needsApproval) &&
      approvalResolution(approvals, tc.id) === undefined &&
      !resumeState?.cancelledToolCallIds?.has(tc.id)
    )
  })

  for (const toolCall of toolCalls) {
    yield* executeOneToolCall({
      toolCall,
      tool: toolMap.get(toolCall.function.name),
      approvals,
      clientResults,
      createCustomEventChunk,
      middlewareHooks,
      userContext,
      abortSignal,
      resumeState,
      hasPendingApprovals,
      results,
      needsApproval,
      needsClientExecution,
    })
  }

  return { results, needsApproval, needsClientExecution }
}

async function* executeOneToolCall<TContext>(input: {
  toolCall: ToolCall
  tool: AnyTool | undefined
  approvals: Map<string, ToolApprovalResolution>
  clientResults: Map<string, any>
  createCustomEventChunk?: (
    eventName: string,
    value: Record<string, any>,
  ) => CustomEvent
  middlewareHooks?: ToolExecutionMiddlewareHooks
  userContext?: TContext
  abortSignal?: AbortSignal
  resumeState?: ToolResumeExecutionState
  hasPendingApprovals: boolean
  results: Array<ToolResult>
  needsApproval: Array<ApprovalRequest>
  needsClientExecution: Array<ClientToolRequest>
}): AsyncGenerator<CustomEvent, void, void> {
  const {
    toolCall,
    tool,
    approvals,
    clientResults,
    createCustomEventChunk,
    middlewareHooks,
    userContext,
    abortSignal,
    resumeState,
    hasPendingApprovals,
    results,
    needsApproval,
    needsClientExecution,
  } = input
  const toolName = toolCall.function.name
  if (!tool) {
    results.push({
      toolCallId: toolCall.id,
      toolName,
      result: { error: `Unknown tool: ${toolName}` },
      state: 'output-error',
    })
    return
  }
  if (
    shouldSkipToolWhileApprovalsPending(
      tool,
      toolCall,
      approvals,
      hasPendingApprovals,
    )
  ) {
    return
  }
  if (resumeState?.cancelledToolCallIds?.has(toolCall.id)) {
    results.push({
      toolCallId: toolCall.id,
      toolName,
      result: { error: 'Tool execution cancelled' },
      state: 'output-error',
    })
    return
  }
  const parsed = parseExecuteToolCallInput(tool, toolCall, toolName)
  if (!parsed.ok) {
    results.push(parsed.result)
    return
  }
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
  if (!tool.execute) {
    handleClientToolCall({
      tool,
      toolCall,
      toolName,
      parsedInput: parsed.input,
      approvals,
      clientResults,
      resumeState,
      results,
      needsApproval,
      needsClientExecution,
    })
    return
  }
  yield* handleServerToolCall({
    tool,
    toolCall,
    toolName,
    parsedInput: parsed.input,
    approvals,
    resumeState,
    middlewareHooks,
    context,
    pendingEvents,
    results,
    needsApproval,
  })
}
