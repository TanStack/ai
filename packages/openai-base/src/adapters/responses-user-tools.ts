import type {
  ComputerActionList,
  ResponseComputerToolCall,
  ResponseComputerToolCallOutputScreenshot,
  ResponseInputItem,
} from 'openai/resources/responses/responses'

/**
 * OpenAI Responses tools the app must run.
 * A container `shell` runs on the provider. `apply_patch`, `local_shell`,
 * `computer`, `computer_use_preview`, and `shell` with
 * `environment.type: "local"` (or no environment) do not.
 */
export type OpenAIUserToolName =
  | 'shell'
  | 'apply_patch'
  | 'local_shell'
  | OpenAIComputerToolName

/** The names of the computer tool: its two tool types. */
export type OpenAIComputerToolName = 'computer' | 'computer_use_preview'

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
  if (
    name === 'shell' ||
    name === 'apply_patch' ||
    name === 'local_shell' ||
    name === 'computer' ||
    name === 'computer_use_preview'
  ) {
    return name
  }
  return null
}

/**
 * A computer action. It goes back to the API as the model sent it, so only
 * its `type` is checked.
 */
function isComputerAction(
  value: unknown,
): value is NonNullable<ResponseComputerToolCall['action']> {
  return isRecord(value) && typeof value.type === 'string'
}

/** The batched actions of a computer call. */
function isComputerActionList(value: unknown): value is ComputerActionList {
  return (
    Array.isArray(value) &&
    value.every((action) => isRecord(action) && typeof action.type === 'string')
  )
}

/**
 * The safety checks of a computer call, with only their known fields.
 *
 * - No list (`undefined` or `null` input): returns `[]`. There are no checks.
 * - A list that does not parse: returns `null`. Do not turn that into `[]`.
 *   An unreadable check must stay visible so the tool can refuse it.
 */
function safetyChecks(
  value: unknown,
): Array<ResponseComputerToolCall.PendingSafetyCheck> | null {
  if (value == null) return []
  if (!Array.isArray(value)) return null
  const checks: Array<ResponseComputerToolCall.PendingSafetyCheck> = []
  for (const check of value) {
    if (!isRecord(check) || typeof check.id !== 'string') return null
    checks.push({
      id: check.id,
      ...(typeof check.code === 'string' ? { code: check.code } : {}),
      ...(typeof check.message === 'string' ? { message: check.message } : {}),
    })
  }
  return checks
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
 * `computerTool` is the name of the computer tool of the request. A
 * `computer_call` is a call to it.
 */
export function readUserExecutedCall(
  item: unknown,
  options: { bareShell: boolean; computerTool?: OpenAIComputerToolName },
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

  if (item.type === 'computer_call') {
    const { action, actions } = item
    const hasAction = isComputerAction(action)
    const hasActions = isComputerActionList(actions)
    if (!callId || (!hasAction && !hasActions)) return null
    const checks = safetyChecks(item.pending_safety_checks)
    return {
      name: options.computerTool ?? 'computer_use_preview',
      callId,
      ...(itemId ? { itemId } : {}),
      input: {
        ...(hasAction ? { action } : {}),
        ...(hasActions ? { actions } : {}),
        // Keep a list that did not parse. The computer tool refuses it.
        pending_safety_checks: checks ?? item.pending_safety_checks,
      },
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

  if (name === 'computer' || name === 'computer_use_preview') {
    const { action, actions } = args
    const hasAction = isComputerAction(action)
    const hasActions = isComputerActionList(actions)
    if (!hasAction && !hasActions) return null
    return {
      type: 'computer_call',
      id: itemId ?? toolCall.id,
      call_id: toolCall.id,
      status: 'completed',
      ...(hasAction ? { action } : {}),
      ...(hasActions ? { actions } : {}),
      pending_safety_checks: safetyChecks(args.pending_safety_checks) ?? [],
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

/**
 * Replay the app's tool result as the matching Responses output item.
 * `computer` is what a computer tool result needs: the screenshot, and
 * whether the call failed. Only a computer result reads the screenshot.
 * The output of a call that did not fail acknowledges the safety checks of
 * the call.
 */
export function userToolResultItem(
  toolCall: ToolCallLike,
  content: unknown,
  computer: {
    screenshot: () => ResponseComputerToolCallOutputScreenshot
    failed: boolean
  },
): ResponseInputItem | null {
  const name = readUserToolName(toolCall.metadata)
  if (!name) return null

  if (name === 'computer' || name === 'computer_use_preview') {
    const checks = computer.failed
      ? []
      : (safetyChecks(
          parseArguments(toolCall.function.arguments).pending_safety_checks,
        ) ?? [])
    return {
      type: 'computer_call_output',
      call_id: toolCall.id,
      output: computer.screenshot(),
      ...(checks.length > 0 ? { acknowledged_safety_checks: checks } : {}),
    }
  }

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
