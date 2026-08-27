import type { AnyTool } from '@tanstack/ai'
import type { ToolDescriptor } from './tool-bridge'

/** Per-call options forwarded to a {@link RemoteToolExecutor}. */
export interface RemoteToolExecuteOptions {
  /** Cancels the in-flight remote call when the in-container run aborts. */
  signal?: AbortSignal
}

/** Runs a named host tool with the given args, returning its raw result. */
export interface RemoteToolExecutor {
  execute: (
    name: string,
    args: unknown,
    options?: RemoteToolExecuteOptions,
  ) => Promise<unknown>
}

/** Wire shape of a tool-exec request the container POSTs to the orchestrator. */
export interface ToolExecRequest {
  name: string
  args: unknown
}

/** Narrow an unknown body into a {@link ToolExecRequest} (project rule: no `as`). */
export function isToolExecRequest(value: unknown): value is ToolExecRequest {
  return (
    value !== null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

export function remoteToolStubs(
  descriptors: Array<ToolDescriptor>,
  executor: RemoteToolExecutor,
): Array<AnyTool> {
  return descriptors.map((descriptor) => ({
    name: descriptor.name,
    description: descriptor.description ?? '',
    inputSchema: descriptor.inputSchema,
    execute: (args: unknown, options?: { abortSignal?: AbortSignal }) =>
      executor.execute(
        descriptor.name,
        args,
        options?.abortSignal !== undefined
          ? { signal: options.abortSignal }
          : {},
      ),
  }))
}

export function toolDescriptors(tools: Array<AnyTool>): Array<ToolDescriptor> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: isJsonSchemaObject(tool.inputSchema)
      ? tool.inputSchema
      : { type: 'object', properties: {} },
  }))
}

function isJsonSchemaObject(
  value: unknown,
): value is { type: 'object'; [key: string]: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    (value as { type?: unknown }).type === 'object'
  )
}

/** Wire shape of a tool-exec response from the orchestrator. */
interface ToolExecResponse {
  result: unknown
}

function isToolExecResponse(value: unknown): value is ToolExecResponse {
  return value !== null && typeof value === 'object' && 'result' in value
}

export function httpRemoteToolExecutor(
  url: string,
  token: string,
): RemoteToolExecutor {
  return {
    async execute(name, args, options) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, args }),
        ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(
          `remote tool "${name}" failed: ${res.status} ${text.slice(0, 200)}`,
        )
      }
      const body: unknown = await res.json()
      if (!isToolExecResponse(body)) {
        throw new Error(
          `remote tool "${name}": malformed orchestrator response`,
        )
      }
      return body.result
    },
  }
}

export function executeHostTool(
  tools: Array<AnyTool>,
  name: string,
  args: unknown,
  options: { context?: unknown; signal?: AbortSignal } = {},
): Promise<unknown> {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool?.execute) {
    return Promise.reject(new Error(`Unknown tool: ${name}`))
  }
  return Promise.resolve(
    tool.execute(args ?? {}, {
      context: options.context,
      abortSignal: options.signal,
    }),
  )
}
