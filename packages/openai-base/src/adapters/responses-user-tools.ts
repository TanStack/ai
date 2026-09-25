import type { ResponseInputItem } from 'openai/resources/responses/responses'

/**
 * OpenAI Responses tools the app must run.
 * A container `shell` runs on the provider. `apply_patch`, `local_shell`,
 * and `shell` with `environment.type: "local"` (or no environment) do not.
 */
export type OpenAIUserToolName = 'shell' | 'apply_patch' | 'local_shell'

export interface OpenAIUserExecutedCall {
  name: OpenAIUserToolName
  callId: string
  itemId?: string
  input: Record<string, unknown>
  maxOutputLength?: number | null
}

interface ToolCallLike {
  id: string
  function: { name: string; arguments: string }
  metadata?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown): Array<string> | null {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    return null
  }
  return value
}

function stringEnv(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const env: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') env[key] = entry
  }
  return env
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' || value === null ? value : null
}

/**
 * Hosted shell calls already include a `shell_call_output` in the same
 * response. Those call ids must not pause the app for another run.
 */
export function hostedShellCallIds(
  output: ReadonlyArray<unknown>,
): Set<string> {
  const ids = new Set<string>()
  for (const item of output) {
    if (
      isRecord(item) &&
      item.type === 'shell_call_output' &&
      typeof item.call_id === 'string'
    ) {
      ids.add(item.call_id)
    }
  }
  return ids
}

export function readUserToolName(metadata: unknown): OpenAIUserToolName | null {
  if (!isRecord(metadata)) return null
  const name = metadata.openaiUserTool
  if (name === 'shell' || name === 'apply_patch' || name === 'local_shell') {
    return name
  }
  return null
}

function readItemId(metadata: unknown): string | undefined {
  if (!isRecord(metadata)) return undefined
  return typeof metadata.itemId === 'string' && metadata.itemId.length > 0
    ? metadata.itemId
    : undefined
}

function readMaxOutputLength(metadata: unknown): number | null | undefined {
  if (!isRecord(metadata)) return undefined
  const value = metadata.maxOutputLength
  return typeof value === 'number' || value === null ? value : undefined
}

function applyPatchOperation(
  value: unknown,
):
  | { type: 'create_file'; path: string; diff: string }
  | { type: 'update_file'; path: string; diff: string }
  | { type: 'delete_file'; path: string }
  | null {
  if (!isRecord(value) || typeof value.path !== 'string') return null
  if (value.type === 'delete_file') {
    return { type: 'delete_file', path: value.path }
  }
  if (
    (value.type === 'create_file' || value.type === 'update_file') &&
    typeof value.diff === 'string'
  ) {
    return { type: value.type, path: value.path, diff: value.diff }
  }
  return null
}

/**
 * Read a user-run Responses output item.
 * `bareShell` is true only once the full response is known. A shell call
 * with no environment waits for that pass, so a hosted call that later
 * carries `shell_call_output` is not asked of the app.
 */
export function readUserExecutedCall(
  item: unknown,
  options: { bareShell: boolean },
): OpenAIUserExecutedCall | null {
  if (!isRecord(item) || typeof item.type !== 'string') return null
  const callId = typeof item.call_id === 'string' ? item.call_id : ''
  const itemId = typeof item.id === 'string' ? item.id : undefined

  if (item.type === 'apply_patch_call') {
    const operation = applyPatchOperation(item.operation)
    if (!callId || !operation) return null
    return {
      name: 'apply_patch',
      callId,
      ...(itemId ? { itemId } : {}),
      input: { operation },
    }
  }

  if (item.type === 'local_shell_call') {
    if (!isRecord(item.action)) return null
    const command = stringList(item.action.command)
    if (!callId || !command || command.length === 0) return null
    return {
      name: 'local_shell',
      callId,
      ...(itemId ? { itemId } : {}),
      input: item.action,
    }
  }

  if (item.type !== 'shell_call') return null
  const environment = item.environment
  if (isRecord(environment)) {
    if (environment.type !== 'local') return null
  } else if (!options.bareShell) {
    return null
  }
  if (!callId || !isRecord(item.action)) return null
  const commands = stringList(item.action.commands)
  if (!commands || commands.length === 0) return null
  const maxOutputLength = nullableNumber(item.action.max_output_length)
  return {
    name: 'shell',
    callId,
    ...(itemId ? { itemId } : {}),
    input: {
      commands,
      max_output_length: maxOutputLength,
      timeout_ms: nullableNumber(item.action.timeout_ms),
    },
    maxOutputLength,
  }
}

function parseArguments(argumentsString: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argumentsString)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseContent(content: unknown): unknown {
  if (typeof content !== 'string') return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return content
  }
}

/** Replay a user-run tool call as the Responses input item OpenAI expects. */
export function userToolRequestItem(
  toolCall: ToolCallLike,
): ResponseInputItem | null {
  const name = readUserToolName(toolCall.metadata)
  if (!name) return null
  const args = parseArguments(toolCall.function.arguments)
  const itemId = readItemId(toolCall.metadata)

  if (name === 'apply_patch') {
    const operation = applyPatchOperation(args.operation)
    if (!operation) return null
    return {
      type: 'apply_patch_call',
      call_id: toolCall.id,
      status: 'completed',
      operation,
      ...(itemId ? { id: itemId } : {}),
    }
  }

  if (name === 'local_shell') {
    const command = stringList(args.command)
    if (!command) return null
    return {
      type: 'local_shell_call',
      id: itemId ?? toolCall.id,
      call_id: toolCall.id,
      status: 'completed',
      action: {
        type: 'exec',
        command,
        env: stringEnv(args.env),
        timeout_ms: nullableNumber(args.timeout_ms),
        ...(typeof args.user === 'string' || args.user === null
          ? { user: args.user }
          : {}),
        ...(typeof args.working_directory === 'string' ||
        args.working_directory === null
          ? { working_directory: args.working_directory }
          : {}),
      },
    }
  }

  const commands = stringList(args.commands)
  if (!commands) return null
  return {
    type: 'shell_call',
    call_id: toolCall.id,
    status: 'completed',
    action: {
      commands,
      max_output_length: nullableNumber(args.max_output_length),
      timeout_ms: nullableNumber(args.timeout_ms),
    },
    ...(itemId ? { id: itemId } : {}),
  }
}

type ShellOutcome = { type: 'exit'; exit_code: number } | { type: 'timeout' }

function shellOutcome(value: unknown): ShellOutcome {
  if (isRecord(value) && value.type === 'timeout') return { type: 'timeout' }
  const exitCode =
    isRecord(value) && typeof value.exit_code === 'number' ? value.exit_code : 0
  return { type: 'exit', exit_code: exitCode }
}

function shellEntry(value: unknown): {
  stdout: string
  stderr: string
  outcome: ShellOutcome
} {
  if (typeof value === 'string') {
    return {
      stdout: value,
      stderr: '',
      outcome: { type: 'exit', exit_code: 0 },
    }
  }
  const record = isRecord(value) ? value : {}
  return {
    stdout: typeof record.stdout === 'string' ? record.stdout : '',
    stderr: typeof record.stderr === 'string' ? record.stderr : '',
    outcome: shellOutcome(record.outcome),
  }
}

function shellOutputList(content: unknown): Array<{
  stdout: string
  stderr: string
  outcome: ShellOutcome
}> {
  const parsed = parseContent(content)
  if (isRecord(parsed) && Array.isArray(parsed.output)) {
    return parsed.output.map((entry) => shellEntry(entry))
  }
  if (isRecord(parsed) && ('stdout' in parsed || 'outcome' in parsed)) {
    return [shellEntry(parsed)]
  }
  if (typeof parsed === 'string') return [shellEntry(parsed)]
  return [shellEntry(JSON.stringify(parsed ?? ''))]
}

/** Replay the app's tool result as the matching Responses output item. */
export function userToolResultItem(
  toolCall: ToolCallLike,
  content: unknown,
): ResponseInputItem | null {
  const name = readUserToolName(toolCall.metadata)
  if (!name) return null
  const parsed = parseContent(content)

  if (name === 'apply_patch') {
    const record = isRecord(parsed) ? parsed : {}
    const failed =
      record.status === 'failed' ||
      (record.status !== 'completed' && typeof record.error === 'string')
    const output =
      typeof record.output === 'string'
        ? record.output
        : typeof record.error === 'string'
          ? record.error
          : typeof parsed === 'string'
            ? parsed
            : undefined
    return {
      type: 'apply_patch_call_output',
      call_id: toolCall.id,
      status: failed ? 'failed' : 'completed',
      ...(output !== undefined ? { output } : {}),
    }
  }

  if (name === 'local_shell') {
    const output =
      typeof parsed === 'string'
        ? parsed
        : isRecord(parsed) && typeof parsed.output === 'string'
          ? parsed.output
          : JSON.stringify(parsed ?? '')
    return {
      type: 'local_shell_call_output',
      id: toolCall.id,
      output,
      status: 'completed',
    }
  }

  const record = isRecord(parsed) ? parsed : {}
  const fromResult = nullableNumber(record.max_output_length)
  const fromCall = readMaxOutputLength(toolCall.metadata)
  const maxOutputLength =
    record.max_output_length !== undefined ? fromResult : fromCall
  return {
    type: 'shell_call_output',
    call_id: toolCall.id,
    output: shellOutputList(content),
    ...(maxOutputLength !== undefined
      ? { max_output_length: maxOutputLength }
      : {}),
  }
}
