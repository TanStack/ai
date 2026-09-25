import {
  DEFAULT_REQUEST_TIMEOUT_MSEC,
  ProtocolError,
  ProtocolErrorCode,
  SdkError,
  SdkErrorCode,
  isCallToolResult,
  isInputRequiredResult,
} from '@modelcontextprotocol/client'
import type {
  Client,
  Request,
  TaskStatus,
  Tool as McpToolDef,
  ToolAnnotations,
  Transport,
} from '@modelcontextprotocol/client'
import type { ContentPart, ToolInputResponse } from '@tanstack/ai'
import {
  isMCPInputRequiredError,
  MCPInputRequiredError,
} from './input-required'
import type { McpServerTool, McpToolMetadata } from './types'

interface ConvertOptions {
  prefix?: string
  lazy?: boolean
}

/** Reads the MCP Apps `_meta.ui.resourceUri` link from a tool def, if present. */
export function extractUiResourceUri(def: McpToolDef): string | undefined {
  const meta = def._meta
  if (!isRecord(meta)) return undefined
  const ui = meta.ui
  if (!isRecord(ui)) return undefined
  return typeof ui.resourceUri === 'string' ? ui.resourceUri : undefined
}

/**
 * The human-readable display name for a tool, following the MCP spec's
 * precedence: the top-level `title` field wins, then the legacy
 * `annotations.title`, and finally the programmatic `name`.
 */
function toolDisplayTitle(def: McpToolDef): string {
  return def.title ?? def.annotations?.title ?? def.name
}

/**
 * Build the `metadata.mcp` block stamped onto every discovered/bound tool.
 * Shared by auto-discovery (`toServerTools`) and the explicit `tools(defs)`
 * path in `client.ts` so the two cannot drift.
 *
 * `annotations` is the server's own object, forwarded verbatim. Per the MCP
 * spec its fields (including `title`) are **hints** — a host may use them for
 * display or to shape an approval UI, but never as a security boundary.
 *
 * Fields the server didn't declare are OMITTED rather than set to `undefined`:
 * the explicit path merges this over any `mcp` block the caller already put on
 * their tool definition, and an `undefined` value would blank out what they set.
 */
export function toolMcpMetadata(
  def: McpToolDef,
  serverId: string | undefined,
): McpToolMetadata {
  const uiResourceUri = extractUiResourceUri(def)
  const annotations: ToolAnnotations | undefined = def.annotations
  return {
    serverToolName: def.name,
    serverId,
    title: toolDisplayTitle(def),
    ...(uiResourceUri !== undefined ? { uiResourceUri } : {}),
    ...(annotations !== undefined ? { annotations } : {}),
  }
}

export function mcpContentToTanstack(
  content: unknown,
): string | Array<ContentPart> {
  // A valid MCP result may carry only structuredContent (no content[]) → guard
  // against undefined/non-array before reading length/map.
  if (!Array.isArray(content)) return ''
  // Single text block → plain string (most common, best for the model).
  if (content.length === 1 && content[0]?.type === 'text')
    return content[0].text
  const parts = content
    .map((c): ContentPart => {
      switch (c.type) {
        case 'text':
          return { type: 'text', content: c.text }
        case 'image':
          return {
            type: 'image',
            source: { type: 'data', value: c.data, mimeType: c.mimeType },
          }
        case 'resource': {
          const uri = c.resource?.uri
          if (typeof uri === 'string' && uri.startsWith('ui://')) {
            // ui:// resources are surfaced via readResource (MCP Apps); omit from model text.
            return { type: 'text', content: '' }
          }
          return { type: 'text', content: JSON.stringify(c.resource) }
        }
        default:
          return { type: 'text', content: JSON.stringify(c) }
      }
    })
    .filter((p) => !(p.type === 'text' && p.content === ''))
  return parts.length ? parts : ''
}

/**
 * Calls one MCP tool and returns the tool result.
 *
 * A spec 2025 task waits on `tasks/get`, then reads `tasks/result`.
 * Spec 2026-07-28 has no tasks, so a 2026 call returns the tool result.
 * `chat()` receives the tool result after the task ends.
 *
 * `signal` stops the wait. This function then sends `tasks/cancel`.
 * It does not wait for that cancel request.
 *
 * If the tool result asks for input, this function throws
 * {@link MCPInputRequiredError}.
 * `kind` is `form` for user input, or `sampling` for a model request.
 * `request` is the input request body.
 * This function does not catch that error.
 *
 * On spec 2026, pass `inputResponse` to answer an input request.
 * The call gets the request again, then sends the answer at once
 * with `inputResponses` and the server's `requestState`.
 * If the server asks for input again after that answer, this throws an Error.
 *
 * @param client - Connected MCP client
 * @param mcpName - Server tool name
 * @param args - Tool arguments
 * @param taskRequired - True when the tool requires a spec 2025 task
 * @param signal - Stops the wait when the caller aborts
 * @param inputResponse - The user's answer from an `mcp_input` interrupt
 */
export async function callMcpTool(
  client: Client,
  mcpName: string,
  args: Record<string, unknown>,
  taskRequired: boolean,
  signal?: AbortSignal,
  inputResponse?: ToolInputResponse,
) {
  signal?.throwIfAborted()
  const isModern = client.getProtocolEra() === 'modern'
  if (!taskRequired && !isModern) {
    const result = await client.callTool(
      { name: mcpName, arguments: args },
      { signal, allowInputRequired: true },
    )
    throwIfInputRequired(result)
    return result
  }

  const params = { name: mcpName, arguments: args }
  let raw = isModern
    ? await rawRequest(client, 'tools/call', params, signal)
    : await sdkRequest(
        client,
        'tools/call',
        { name: mcpName, arguments: args, task: {} },
        signal,
      )
  // ponytail: the answer is sent on the second call, so the server state never
  // travels through the browser. The cost is one extra tools/call.
  if (isModern && inputResponse !== undefined && isInputRequiredResult(raw)) {
    raw = await rawRequest(
      client,
      'tools/call',
      { ...params, ...retryParams(raw, inputResponse) },
      signal,
    )
    // ponytail: one input round per call. The next resume starts with no
    // requestState, so a second pause would ask round 1 again forever.
    // Carry requestState through the interrupt if servers need more rounds.
    if (isInputRequiredResult(raw)) {
      throw new Error(
        `The MCP tool "${mcpName}" asked for input a second time. ` +
          'This client answers one input request per tool call.',
      )
    }
  }
  return finishToolCall(client, mcpName, raw, signal)
}

// Answers only the first input request. That is the one the interrupt shows.
function retryParams(
  result: { inputRequests?: unknown; requestState?: string },
  response: ToolInputResponse,
) {
  const requests = isRecord(result.inputRequests) ? result.inputRequests : {}
  const key = Object.keys(requests)[0]
  const entry = key === undefined ? undefined : requests[key]
  const method = isRecord(entry) ? entry.method : undefined
  const requestState =
    result.requestState === undefined
      ? {}
      : { requestState: result.requestState }
  if (key === undefined) return requestState
  return {
    inputResponses: { [key]: inputAnswer(method, response) },
    ...requestState,
  }
}

function inputAnswer(method: unknown, response: ToolInputResponse) {
  if (method === 'sampling/createMessage') {
    if (response.status === 'cancelled') {
      throw new Error('The user cancelled the MCP sampling request.')
    }
    const payload = response.payload
    if (typeof payload !== 'string') return payload
    return {
      role: 'assistant',
      content: { type: 'text', text: payload },
      model: 'user',
    }
  }
  if (response.status === 'cancelled') return { action: 'cancel' }
  const payload = response.payload
  // An ElicitResult passes as is. Any other value is the accepted content.
  if (isRecord(payload) && typeof payload.action === 'string') return payload
  return { action: 'accept', content: payload }
}

const schemaSlot: unknown = undefined

const passThroughResult = {
  '~standard': {
    version: 1 as const,
    vendor: 'tanstack-ai-mcp',
    types: {
      input: schemaSlot,
      output: schemaSlot,
    },
    validate(value: unknown) {
      return { value }
    },
  },
}

/** The spec 2025-11-25 task fields this client reads. */
type TaskState = {
  taskId: string
  status: TaskStatus
  pollInterval: number | undefined
  statusMessage: string | undefined
}

const defaultPollMs = 1000

let rawRequestId = 0

const transportTaps = new WeakMap<
  Transport,
  Set<(message: unknown) => boolean>
>()

async function finishToolCall(
  client: Client,
  mcpName: string,
  raw: unknown,
  signal?: AbortSignal,
) {
  throwIfInputRequired(raw)
  // A spec 2025 task body also carries `content`. Read the task first.
  const task = readNestedTask(raw)
  if (task !== undefined) {
    return pollTask(client, mcpName, task, signal)
  }
  if (isCallToolResult(raw)) return raw
  throw missingTaskResult(mcpName)
}

async function pollTask(
  client: Client,
  mcpName: string,
  task: TaskState,
  signal?: AbortSignal,
) {
  let current = task
  try {
    while (
      current.status === 'working' ||
      current.status === 'input_required'
    ) {
      if (current.status === 'input_required') {
        // A spec 2025 task sends its input request on tasks/result, as a
        // request to the client. This client does not answer those requests,
        // so stop here. Polling again would never end.
        void cancelTask(client, current.taskId)
        throw new Error(
          `MCP task "${current.taskId}" needs input. This client cannot answer a spec 2025 task input request.`,
        )
      }
      const delay = current.pollInterval ?? defaultPollMs
      await waitForPoll(delay, signal)
      current = await readPolledTask(client, current.taskId, mcpName, signal)
    }
  } catch (error) {
    if (isMCPInputRequiredError(error)) throw error
    if (signal?.aborted) {
      void cancelTask(client, task.taskId)
      throw abortReason(signal)
    }
    throw error
  }

  switch (current.status) {
    case 'completed':
      return taskResult(client, mcpName, current.taskId, signal)
    case 'failed':
    case 'cancelled':
      throw terminalTaskError(current)
    default: {
      const unexpected: never = current.status
      throw new Error(`Unknown MCP task status: ${String(unexpected)}`)
    }
  }
}

async function taskResult(
  client: Client,
  mcpName: string,
  taskId: string,
  signal?: AbortSignal,
) {
  const result = await taskRequest(client, 'tasks/result', { taskId }, signal)
  throwIfInputRequired(result)
  if (!isCallToolResult(result)) throw missingTaskResult(mcpName)
  return result
}

async function readPolledTask(
  client: Client,
  taskId: string,
  mcpName: string,
  signal?: AbortSignal,
) {
  const body = await taskRequest(client, 'tasks/get', { taskId }, signal)
  throwIfInputRequired(body)
  const task = readTaskState(body)
  if (task === undefined) throw missingTaskResult(mcpName)
  return task
}

function taskRequest(
  client: Client,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
) {
  return sdkRequest(client, method, params, signal)
}

async function sdkRequest(
  client: Client,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const rpc: Request = { method, params }
  try {
    return await client.request(
      rpc,
      passThroughResult,
      signal === undefined ? undefined : { signal },
    )
  } catch (error) {
    if (signal?.aborted) throw abortReason(signal)
    throw error
  }
}

function rawRequest(
  client: Client,
  method: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const transport = client.transport
  if (transport === undefined) {
    throw new Error('The MCP client is not connected.')
  }
  rawRequestId += 1
  const id = `tanstack-ai-mcp:${rawRequestId}`
  const listeners = tapTransport(transport)
  const body = withEnvelope(params, readEnvelope(client))
  return new Promise<unknown>((resolve, reject) => {
    let settled = false
    // Same limit as an SDK request, so a lost response cannot hang the call.
    const timer = setTimeout(() => {
      finish(
        new SdkError(
          SdkErrorCode.RequestTimeout,
          `The MCP request ${method} timed out after ${DEFAULT_REQUEST_TIMEOUT_MSEC} ms.`,
        ),
      )
    }, DEFAULT_REQUEST_TIMEOUT_MSEC)
    const finish = (error: unknown, result?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      listeners.delete(accept)
      if (signal !== undefined) {
        signal.removeEventListener('abort', onAbort)
      }
      if (error !== undefined) {
        reject(error)
        return
      }
      resolve(result)
    }
    const accept = (message: unknown) => {
      if (!isRecord(message) || message.id !== id) return false
      if (isRecord(message.error)) {
        const { code, message: text, data } = message.error
        finish(
          new ProtocolError(
            typeof code === 'number' ? code : ProtocolErrorCode.InternalError,
            typeof text === 'string' ? text : 'The MCP request failed.',
            data,
          ),
        )
        return true
      }
      finish(undefined, message.result)
      return true
    }
    const activeSignal = signal
    const onAbort = () => {
      if (activeSignal === undefined) return
      finish(abortReason(activeSignal))
    }
    listeners.add(accept)
    if (activeSignal !== undefined) {
      activeSignal.addEventListener('abort', onAbort, { once: true })
    }
    void transport
      .send({
        jsonrpc: '2.0',
        id,
        method,
        params: body,
      })
      .catch((error: unknown) => {
        finish(error)
      })
  })
}

function tapTransport(transport: Transport) {
  const existing = transportTaps.get(transport)
  if (existing !== undefined) return existing
  const listeners = new Set<(message: unknown) => boolean>()
  transportTaps.set(transport, listeners)
  const previous = transport.onmessage
  transport.onmessage = (message, extra) => {
    const pending = [...listeners]
    for (const listener of pending) {
      if (listener(message)) return
    }
    previous?.(message, extra)
  }
  return listeners
}

function readEnvelope(client: Client) {
  const value: unknown = client
  if (!isRecord(value)) return undefined
  const method = value._outboundMetaEnvelope
  if (typeof method !== 'function') return undefined
  const called: unknown = method.call(value)
  if (!isRecord(called)) return undefined
  return called
}

function withEnvelope(
  params: Record<string, unknown>,
  envelope: Record<string, unknown> | undefined,
) {
  if (envelope === undefined) return params
  const meta = isRecord(params._meta) ? params._meta : {}
  return {
    ...params,
    _meta: { ...envelope, ...meta },
  }
}

function cancelTask(client: Client, taskId: string) {
  return taskRequest(client, 'tasks/cancel', { taskId }).catch(() => undefined)
}

function throwIfInputRequired(value: unknown) {
  if (!isRecord(value)) return
  if (isInputRequiredResult(value)) {
    throwInputRequired(value.inputRequests, value)
  }
  if (value.status !== 'input_required') return
  if (!hasRequests(value.inputRequests)) return
  throwInputRequired(value.inputRequests, value)
}

function throwInputRequired(requests: unknown, fallback: unknown) {
  const entry = firstInputRequest(requests)
  if (entry === undefined) {
    throw new MCPInputRequiredError('form', fallback)
  }
  const body = isRecord(entry.params) ? entry.params : entry
  if (entry.method === 'sampling/createMessage') {
    throw new MCPInputRequiredError('sampling', body)
  }
  if (entry.method === 'elicitation/create') {
    throw new MCPInputRequiredError('form', body)
  }
  throw new Error(`The MCP server asked for unsupported input: ${entry.method}`)
}

function firstInputRequest(requests: unknown) {
  if (!isRecord(requests)) return undefined
  const entries = Object.values(requests)
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.method !== 'string') continue
    return entry
  }
  return undefined
}

function hasRequests(requests: unknown) {
  return isRecord(requests) && Object.keys(requests).length > 0
}

function readNestedTask(value: unknown) {
  if (!isRecord(value)) return undefined
  return readTaskState(value.task)
}

function readTaskState(value: unknown) {
  if (!isRecord(value)) return undefined
  if (typeof value.taskId !== 'string' || value.taskId.length === 0) {
    return undefined
  }
  if (!isTaskStatus(value.status)) return undefined
  const task: TaskState = {
    taskId: value.taskId,
    status: value.status,
    pollInterval:
      typeof value.pollInterval === 'number' ? value.pollInterval : undefined,
    statusMessage:
      typeof value.statusMessage === 'string' ? value.statusMessage : undefined,
  }
  return task
}

function isTaskStatus(value: unknown): value is TaskStatus {
  switch (value) {
    case 'working':
    case 'input_required':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return true
    default:
      return false
  }
}

function terminalTaskError(task: TaskState) {
  const detail = task.statusMessage
  if (detail !== undefined && detail.length > 0) {
    return new Error(`MCP task "${task.taskId}" ${task.status}: ${detail}`)
  }
  return new Error(`MCP task "${task.taskId}" ${task.status}.`)
}

function missingTaskResult(mcpName: string) {
  return new Error(
    `MCP task-required tool "${mcpName}" ended without a result or error`,
  )
}

function waitForPoll(milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (milliseconds <= 0) return Promise.resolve()
  if (signal === undefined) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds)
    })
  }
  const active = signal
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      active.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortReason(active))
    }
    active.addEventListener('abort', onAbort, { once: true })
  })
}

function abortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Aborted', 'AbortError')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Build the execute body that proxies a TanStack tool call to an MCP server.
 * Shared by auto-discovery and the definition path.
 *
 * @param preferStructured when true (i.e. the tool declares an outputSchema),
 *   return `result.structuredContent` if present so the existing output
 *   validation in `executeServerTool` validates MCP's typed payload rather than
 *   a JSON-in-text blob. Otherwise normalize `content[]` → string | ContentPart[].
 */
export function makeMcpExecute(
  client: Client,
  mcpName: string,
  preferStructured: boolean,
  taskRequired = false,
) {
  return async (
    args: unknown,
    ctx?: { abortSignal?: AbortSignal; inputResponse?: ToolInputResponse },
  ) => {
    const result = await callMcpTool(
      client,
      mcpName,
      isRecord(args) ? args : {},
      taskRequired,
      ctx?.abortSignal,
      ctx?.inputResponse,
    )
    if (result.isError) {
      const text = Array.isArray(result.content)
        ? mcpContentToTanstack(result.content)
        : undefined
      const detail =
        typeof text === 'string'
          ? text
          : text === undefined
            ? undefined
            : JSON.stringify(text)
      // An empty/absent detail (e.g. a ui://-only error body) would render a
      // dangling colon — fall back to the bare message.
      throw new Error(
        !detail
          ? `MCP tool "${mcpName}" returned an error`
          : `MCP tool "${mcpName}" returned an error: ${detail}`,
      )
    }
    if (preferStructured && result.structuredContent !== undefined) {
      return result.structuredContent
    }
    return mcpContentToTanstack(result.content)
  }
}

/** A tool that must run as a task. */
export function requiresTaskExecution(def: McpToolDef): boolean {
  return def.execution?.taskSupport === 'required'
}

/** The server declares task-based execution support for tools/call. */
export function serverSupportsTaskCalls(client: Client): boolean {
  return Boolean(client.getServerCapabilities()?.tasks?.requests?.tools?.call)
}

/**
 * Auto-discovery path: turn raw MCP tool defs into ServerTools. Task-required
 * tools are excluded when the server does not declare the tasks capability
 * for tools/call — every invocation would fail, so they must not be offered
 * to the model.
 */
export function toServerTools(
  client: Client,
  defs: Array<McpToolDef>,
  options: ConvertOptions,
): Array<McpServerTool> {
  const supportsTasks = serverSupportsTaskCalls(client)
  return defs
    .filter((def) => !requiresTaskExecution(def) || supportsTasks)
    .map((def) => {
      const name = options.prefix ? `${options.prefix}_${def.name}` : def.name
      const tool: McpServerTool = {
        __toolSide: 'server',
        name,
        description: def.description ?? '',
        inputSchema: (def.inputSchema as any) ?? {
          type: 'object',
          properties: {},
        },
        ...(def.outputSchema ? { outputSchema: def.outputSchema as any } : {}),
        ...(options.lazy ? { lazy: true } : {}),
        metadata: {
          mcp: toolMcpMetadata(def, options.prefix),
        },
        execute: makeMcpExecute(
          client,
          def.name,
          Boolean(def.outputSchema),
          requiresTaskExecution(def),
        ),
      }
      return tool
    })
}
