/**
 * Host-tool delegation for the CO-LOCATED ("combined") sandbox model.
 *
 * In the co-located model the harness loop AND its MCP tool-bridge run INSIDE
 * the container (the in-container sandbox is just `local-process`, so the
 * existing adapter + `nodeHttpBridgeProvisioner` serve the bridge on the
 * container's own `localhost` with native stdin — nothing new there). The one
 * thing that still must cross the container→orchestrator boundary is the
 * **execution** of `chat()`-provided server tools: their `execute()` closures
 * (DB / secrets / app state) live in the orchestrator, not the container.
 *
 * This module is that narrow seam:
 * - {@link remoteToolStubs} (container side) rebuilds `chat()` tools from
 *   serialized {@link ToolDescriptor}s; each stub's `execute` delegates to a
 *   {@link RemoteToolExecutor} instead of running locally. The adapter bridges
 *   these stubs exactly like real tools.
 * - {@link httpRemoteToolExecutor} (container side) is the default executor: it
 *   POSTs `{ name, args }` to the orchestrator's tool-exec endpoint.
 * - {@link executeHostTool} (orchestrator side) runs the REAL tool and returns
 *   its raw result — the only host code the container can reach.
 *
 * So the public network surface shrinks from "the whole MCP protocol" (served
 * from the orchestrator in the DO-drives-container model) to "one authenticated
 * tool-exec call" — the MCP transport itself never leaves the container.
 */
import type { AnyTool } from '@tanstack/ai'
import type { ToolDescriptor } from './tool-bridge'

/** Runs a named host tool with the given args, returning its raw result. */
export interface RemoteToolExecutor {
  execute: (name: string, args: unknown) => Promise<unknown>
}

/**
 * Rebuild `chat()` tool objects (container side) from serialized descriptors.
 * Each stub advertises the descriptor's JSON-schema and delegates `execute` to
 * the executor; the harness adapter bridges them like any other tool.
 */
export function remoteToolStubs(
  descriptors: Array<ToolDescriptor>,
  executor: RemoteToolExecutor,
): Array<AnyTool> {
  return descriptors.map((descriptor) => ({
    name: descriptor.name,
    description: descriptor.description ?? '',
    inputSchema: descriptor.inputSchema,
    execute: (args: unknown) => executor.execute(descriptor.name, args),
  }))
}

/**
 * Serialize `chat()` tools to wire descriptors to send into the container.
 * `inputSchema` must already be a plain JSON-schema object (convert Standard
 * Schemas before calling, the same way harness adapters advertise tools).
 */
export function toolDescriptors(
  tools: Array<AnyTool>,
): Array<ToolDescriptor> {
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

/**
 * The default {@link RemoteToolExecutor}: POST `{ name, args }` (bearer-gated)
 * to the orchestrator's tool-exec endpoint and return its `result`. A non-2xx
 * or malformed response throws (surfaced to the agent as a failed tool call by
 * the bridge) — never silently swallowed.
 */
export function httpRemoteToolExecutor(
  url: string,
  token: string,
): RemoteToolExecutor {
  return {
    async execute(name, args) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, args }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(
          `remote tool "${name}" failed: ${res.status} ${text.slice(0, 200)}`,
        )
      }
      const body: unknown = await res.json()
      if (!isToolExecResponse(body)) {
        throw new Error(`remote tool "${name}": malformed orchestrator response`)
      }
      return body.result
    },
  }
}

/**
 * Run a host tool by name with the given args, returning its raw result
 * (orchestrator side of {@link httpRemoteToolExecutor}). Throws for an unknown
 * tool or one with no `execute` — the orchestrator surfaces that as a 4xx/5xx.
 */
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
