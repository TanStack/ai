import { randomUUID } from 'node:crypto'
import { DAYTONA_RESULT_MARKER, wrapCode } from './wrap-code'
import type {
  ExecutionResult,
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
  NormalizedError,
  ToolBinding,
} from '@tanstack/ai-code-mode'
import type {
  DaytonaCodeRunResponse,
  DaytonaExecutionEnvelope,
  DaytonaExecutionError,
  DaytonaSandboxLike,
  ToolCallRequest,
  ToolResultPayload,
  ToolSchema,
} from './types'

const TOOL_CALL_ID = /^tc_(0|[1-9]\d*)$/

export interface DaytonaIsolateDriverConfig {
  /**
   * Caller-owned Daytona SDK sandbox or any object with a compatible
   * `process.codeRun`. Context disposal prevents further use of this sandbox,
   * but sandbox creation and cleanup stay with the caller.
   */
  sandbox: DaytonaSandboxLike

  /**
   * Default total execution timeout in milliseconds (default: 30000).
   * Each Daytona `codeRun` receives the remaining budget as whole seconds.
   */
  timeout?: number

  /**
   * Maximum number of tool callback rounds (default: 10).
   */
  maxToolRounds?: number
}

function bindingsToSchemas(
  bindings: Record<string, ToolBinding>,
): Array<ToolSchema> {
  return Object.entries(bindings).map(([name, binding]) => ({
    name,
    description: binding.description,
    inputSchema: binding.inputSchema,
  }))
}

function normalizeError(error: unknown): DaytonaExecutionError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    }
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    return {
      name: typeof record.name === 'string' ? record.name : 'Error',
      message: typeof record.message === 'string' ? record.message : 'Error',
    }
  }

  return { name: 'Error', message: String(error) }
}

function toNormalizedError(error: DaytonaExecutionError): NormalizedError {
  return {
    name: error.name,
    message: error.message,
    ...(error.stack !== undefined ? { stack: error.stack } : {}),
  }
}

function timeoutMsToSeconds(timeout: number): number {
  return Math.ceil(timeout / 1000)
}

function createResultMarker(): string {
  return `${DAYTONA_RESULT_MARKER}:${randomUUID()}:`
}

function validateTimeoutMs(timeout: number, fieldName: string): number {
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`${fieldName} must be a finite positive number`)
  }
  return timeout
}

function validateMaxToolRounds(maxToolRounds: number): number {
  if (
    !Number.isFinite(maxToolRounds) ||
    !Number.isInteger(maxToolRounds) ||
    maxToolRounds < 0
  ) {
    throw new Error('maxToolRounds must be a finite non-negative integer')
  }
  return maxToolRounds
}

function outputFromCodeRun(response: DaytonaCodeRunResponse): string {
  const stdout = response.artifacts?.stdout
  if (stdout !== undefined) {
    return stdout
  }
  if (response.result !== undefined) {
    return response.result
  }
  return ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function hasOwn<T extends object>(object: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function toolCallIdFor(index: number): string {
  return `tc_${index}`
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T | undefined> {
  let timer: number | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, milliseconds)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

function readStringArray(value: unknown, fieldName: string): Array<string> {
  if (!Array.isArray(value)) {
    throw new Error(`Daytona envelope field '${fieldName}' must be an array`)
  }
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new Error(
      `Daytona envelope field '${fieldName}' must contain only strings`,
    )
  }
  return value
}

function readExecutionError(
  value: unknown,
  fieldName: string,
): DaytonaExecutionError {
  if (!isRecord(value)) {
    throw new Error(`Daytona envelope field '${fieldName}' must be an object`)
  }

  const { name, message, stack } = value
  if (typeof name !== 'string' || typeof message !== 'string') {
    throw new Error(
      `Daytona envelope field '${fieldName}' must include string name and message`,
    )
  }

  return {
    name,
    message,
    ...(typeof stack === 'string' ? { stack } : {}),
  }
}

function readToolCalls(value: unknown): Array<ToolCallRequest> {
  if (!Array.isArray(value)) {
    throw new Error("Daytona envelope field 'toolCalls' must be an array")
  }

  const seenIds = new Set<string>()

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error('Daytona tool call must be an object')
    }

    const { id, name, args } = item
    if (typeof id !== 'string' || typeof name !== 'string') {
      throw new Error('Daytona tool call must include string id and name')
    }
    if (!TOOL_CALL_ID.test(id)) {
      throw new Error(`Invalid Daytona tool call id: ${id}`)
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate Daytona tool call id: ${id}`)
    }

    seenIds.add(id)
    return { id, name, args }
  })
}

function assertNewToolCallId(
  toolResults: Record<string, ToolResultPayload>,
  id: string,
): void {
  if (hasOwn(toolResults, id)) {
    throw new Error(`Daytona tool call id already has a cached result: ${id}`)
  }
}

function assertExpectedToolCalls(
  toolCalls: Array<ToolCallRequest>,
  nextToolCallIndex: number,
  toolResults: Record<string, ToolResultPayload>,
): void {
  if (toolCalls.length === 0) {
    throw new Error('Daytona need_tools response must include tool calls')
  }

  toolCalls.forEach((toolCall, index) => {
    assertNewToolCallId(toolResults, toolCall.id)

    const expectedId = toolCallIdFor(nextToolCallIndex + index)
    if (toolCall.id !== expectedId) {
      throw new Error(
        `Daytona tool call ids must be contiguous from ${expectedId}; received ${toolCall.id}`,
      )
    }
  })
}

async function executeToolCall(
  bindings: Record<string, ToolBinding>,
  toolCall: ToolCallRequest,
): Promise<[string, ToolResultPayload]> {
  const binding = hasOwn(bindings, toolCall.name)
    ? bindings[toolCall.name]
    : undefined

  if (!binding) {
    return [
      toolCall.id,
      {
        success: false,
        error: `Unknown tool: ${toolCall.name}`,
      },
    ]
  }

  try {
    const value = await binding.execute(toolCall.args)
    return [toolCall.id, { success: true, value }]
  } catch (toolError) {
    const error = normalizeError(toolError)
    return [
      toolCall.id,
      {
        success: false,
        error: error.message,
      },
    ]
  }
}

function parseExecutionEnvelope(
  output: string,
  resultMarker: string,
): DaytonaExecutionEnvelope {
  const markerLine = output
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.startsWith(resultMarker))

  if (!markerLine) {
    throw new Error('Daytona codeRun output did not include Code Mode marker')
  }

  const jsonText = markerLine.slice(resultMarker.length)
  const parsed: unknown = JSON.parse(jsonText)

  if (!isRecord(parsed) || typeof parsed.status !== 'string') {
    throw new Error('Daytona codeRun marker did not contain a valid envelope')
  }

  if (parsed.status === 'done') {
    if (typeof parsed.success !== 'boolean') {
      throw new Error("Daytona envelope field 'success' must be a boolean")
    }

    if (parsed.success) {
      if (parsed.error !== undefined) {
        throw new Error('Daytona success envelope must not include error')
      }

      return {
        status: 'done',
        success: true,
        value: parsed.value,
        logs: readStringArray(parsed.logs, 'logs'),
      }
    }

    if (parsed.value !== undefined) {
      throw new Error('Daytona failure envelope must not include value')
    }

    return {
      status: 'done',
      success: false,
      error: readExecutionError(parsed.error, 'error'),
      logs: readStringArray(parsed.logs, 'logs'),
    }
  }

  if (parsed.status === 'need_tools') {
    return {
      status: 'need_tools',
      toolCalls: readToolCalls(parsed.toolCalls),
      logs: readStringArray(parsed.logs, 'logs'),
    }
  }

  if (parsed.status === 'error') {
    return {
      status: 'error',
      error: readExecutionError(parsed.error, 'error'),
    }
  }

  throw new Error(`Unknown Daytona execution status: ${parsed.status}`)
}

class DaytonaIsolateContext implements IsolateContext {
  private disposed = false

  constructor(
    private readonly sandbox: DaytonaSandboxLike,
    private readonly bindings: Record<string, ToolBinding>,
    private readonly timeoutMs: number,
    private readonly maxToolRounds: number,
  ) {}

  private disposedResult<T>(logs: Array<string>): ExecutionResult<T> {
    return {
      success: false,
      error: {
        name: 'DisposedError',
        message: 'Context has been disposed',
      },
      logs,
    }
  }

  private timeoutResult<T>(logs: Array<string>): ExecutionResult<T> {
    return {
      success: false,
      error: {
        name: 'TimeoutError',
        message: `Exceeded Daytona execution timeout (${this.timeoutMs}ms)`,
      },
      logs,
    }
  }

  private isDisposed(): boolean {
    return this.disposed
  }

  private remainingTimeoutSeconds(deadlineMs: number): number | undefined {
    const remainingMs = deadlineMs - Date.now()
    if (remainingMs <= 0) {
      return undefined
    }
    return timeoutMsToSeconds(remainingMs)
  }

  private remainingTimeoutMs(deadlineMs: number): number | undefined {
    const remainingMs = deadlineMs - Date.now()
    return remainingMs > 0 ? remainingMs : undefined
  }

  async execute<T = unknown>(code: string): Promise<ExecutionResult<T>> {
    if (this.isDisposed()) {
      return this.disposedResult([])
    }

    const tools = bindingsToSchemas(this.bindings)
    let toolResults: Record<string, ToolResultPayload> | undefined
    let allLogs: Array<string> = []
    let toolRounds = 0
    let nextToolCallIndex = 0
    const deadlineMs = Date.now() + this.timeoutMs

    for (;;) {
      try {
        if (this.isDisposed()) {
          return this.disposedResult(allLogs)
        }

        const remainingCodeRunMs = this.remainingTimeoutMs(deadlineMs)
        if (remainingCodeRunMs === undefined) {
          return this.timeoutResult(allLogs)
        }

        const resultMarker = createResultMarker()
        const wrappedCode = wrapCode(code, tools, toolResults, resultMarker)
        const response = await withTimeout(
          this.sandbox.process.codeRun(
            wrappedCode,
            undefined,
            timeoutMsToSeconds(remainingCodeRunMs),
          ),
          remainingCodeRunMs,
        )
        if (response === undefined) {
          return this.timeoutResult(allLogs)
        }
        const output = outputFromCodeRun(response)
        const result = parseExecutionEnvelope(output, resultMarker)

        if (result.status === 'error') {
          return {
            success: false,
            error: toNormalizedError(result.error),
            logs: allLogs,
          }
        }

        if (result.status === 'done') {
          allLogs = result.logs
          if (this.isDisposed()) {
            return this.disposedResult(allLogs)
          }
          if (!result.success) {
            return {
              success: false,
              error: toNormalizedError(result.error),
              logs: allLogs,
            }
          }

          return {
            success: true,
            value: result.value as T,
            logs: allLogs,
          }
        }

        allLogs = result.logs
        if (this.isDisposed()) {
          return this.disposedResult(allLogs)
        }

        if (toolRounds >= this.maxToolRounds) {
          return {
            success: false,
            error: {
              name: 'MaxRoundsExceeded',
              message: `Exceeded maximum tool callback rounds (${this.maxToolRounds})`,
            },
            logs: allLogs,
          }
        }

        const cachedToolResults = { ...(toolResults ?? {}) }
        assertExpectedToolCalls(
          result.toolCalls,
          nextToolCallIndex,
          cachedToolResults,
        )
        toolRounds++
        nextToolCallIndex += result.toolCalls.length

        if (this.isDisposed()) {
          return this.disposedResult(allLogs)
        }

        const remainingToolMs = this.remainingTimeoutMs(deadlineMs)
        if (remainingToolMs === undefined) {
          return this.timeoutResult(allLogs)
        }
        const batchEntries = await withTimeout(
          Promise.all(
            result.toolCalls.map((toolCall) =>
              executeToolCall(this.bindings, toolCall),
            ),
          ),
          remainingToolMs,
        )
        if (batchEntries === undefined) {
          return this.timeoutResult(allLogs)
        }
        if (this.isDisposed()) {
          return this.disposedResult(allLogs)
        }
        if (this.remainingTimeoutSeconds(deadlineMs) === undefined) {
          return this.timeoutResult(allLogs)
        }
        const batchResults: Record<string, ToolResultPayload> = {}
        for (const [id, payload] of batchEntries) {
          batchResults[id] = payload
        }
        toolResults = { ...cachedToolResults, ...batchResults }
      } catch (error) {
        const normalized = normalizeError(error)
        return {
          success: false,
          error: {
            name: 'DaytonaExecutionError',
            message: `Failed to execute code in Daytona sandbox: ${normalized.message}`,
          },
          logs: allLogs,
        }
      }
    }
  }

  dispose(): Promise<void> {
    this.disposed = true
    return Promise.resolve()
  }
}

export function createDaytonaIsolateDriver(
  config: DaytonaIsolateDriverConfig,
): IsolateDriver {
  const sandbox = config.sandbox
  const defaultTimeoutMs = validateTimeoutMs(config.timeout ?? 30000, 'timeout')
  const maxToolRounds = validateMaxToolRounds(config.maxToolRounds ?? 10)

  return {
    createContext(isolateConfig: IsolateConfig): Promise<IsolateContext> {
      const timeoutMs = validateTimeoutMs(
        isolateConfig.timeout ?? defaultTimeoutMs,
        'timeout',
      )
      return Promise.resolve(
        new DaytonaIsolateContext(
          sandbox,
          isolateConfig.bindings,
          timeoutMs,
          maxToolRounds,
        ),
      )
    },
  }
}
