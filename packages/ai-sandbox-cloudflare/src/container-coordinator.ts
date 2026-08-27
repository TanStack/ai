import { EventType } from '@tanstack/ai'
import {
  executeHostTool,
  isToolExecRequest,
  toolDescriptors,
} from '@tanstack/ai-sandbox'
import { getSandbox } from '@cloudflare/sandbox'
import { SandboxCoordinator, resolveBridgeOrigin } from './coordinator'
import { timingSafeBearerEqualWeb } from './web-crypto'
import type { StartRunInput } from './coordinator'
import type { ContainerRunRequest, HarnessId } from './protocol'
import type { AnyTool, StreamChunk } from '@tanstack/ai'
import type { WorkspaceDefinition } from '@tanstack/ai-sandbox'
import type { Sandbox } from '@cloudflare/sandbox'

/** Port the in-container runner listens on (matches RUNNER_PORT in the image). */
const RUNNER_PORT = 8080

export interface ContainerCoordinatorEnv {
  /** The `@cloudflare/sandbox` Sandbox DO namespace (the container hosts). */
  Sandbox: DurableObjectNamespace<Sandbox>
  PUBLIC_HOSTNAME?: string
}

/** What {@link ContainerSandboxCoordinator.config} returns for one run. */
export interface ContainerRunConfig {
  hostTools: Array<AnyTool>
  /** Workspace the in-container runner bootstraps for the agent. */
  workspace: WorkspaceDefinition
  /** Which in-sandbox harness the runner spawns. */
  harness: HarnessId
  /** Model id passed to that harness. */
  model: string
  /** Runtime context forwarded to each host tool's `execute()` (DB / app state). */
  context?: unknown
}

/** Per-run tool-exec state; gates `/tool-exec/:runId` and runs the host tools. */
interface ToolExecState {
  token: string
  hostTools: Array<AnyTool>
  context?: unknown
  /** Aborted once the run is terminal so a still-running host tool is cancelled. */
  abort: AbortController
}

/** Narrow one NDJSON line into a StreamChunk (project rule: no `as`). */
function isStreamChunk(value: unknown): value is StreamChunk {
  return value !== null && typeof value === 'object' && 'type' in value
}

async function* ndjsonToChunks(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result = await reader.read()
  while (!result.done) {
    buffer += decoder.decode(result.value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (line === '') continue
      const chunk = parseChunkLine(line)
      yield chunk
      if (chunk.type === EventType.RUN_ERROR) return
    }
    result = await reader.read()
  }
  buffer += decoder.decode()
  const tail = buffer.trim()
  if (tail !== '') yield parseChunkLine(tail)
}

function parseChunkLine(line: string): StreamChunk {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return {
      type: EventType.RUN_ERROR,
      message: `runner sent unparseable NDJSON: ${line.slice(0, 200)}`,
    }
  }
  if (!isStreamChunk(parsed)) {
    return {
      type: EventType.RUN_ERROR,
      message: 'runner sent a non-chunk line',
    }
  }
  return parsed
}

export abstract class ContainerSandboxCoordinator<
  TEnv extends ContainerCoordinatorEnv = ContainerCoordinatorEnv,
> extends SandboxCoordinator<TEnv> {
  private readonly toolExec = new Map<string, ToolExecState>()

  private runnerBoot?: Promise<void>

  /** Last `/health` probe error, surfaced if the runner never comes up. */
  private lastProbeError?: unknown

  protected abstract config(input: StartRunInput): ContainerRunConfig

  protected override buildRunStream(
    input: StartRunInput,
  ): AsyncIterable<StreamChunk> {
    const runConfig = this.config(input)
    // Mint the token BEFORE driving the container, registering the real tools so
    // `/tool-exec/:runId` can execute them.
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
    this.toolExec.set(input.runId, {
      token,
      hostTools: runConfig.hostTools,
      ...(runConfig.context !== undefined
        ? { context: runConfig.context }
        : {}),
      abort: new AbortController(),
    })
    return this.driveContainer(input, runConfig, token)
  }

  protected override onRunSettled(runId: string): void {
    const state = this.toolExec.get(runId)
    if (state) state.abort.abort()
    this.toolExec.delete(runId)
  }

  private async *driveContainer(
    input: StartRunInput,
    runConfig: ContainerRunConfig,
    token: string,
  ): AsyncIterable<StreamChunk> {
    const sandbox = getSandbox(this.env.Sandbox, input.threadId)
    await this.ensureRunner(sandbox, runConfig.workspace)
    const origin = resolveBridgeOrigin(this.env, input)
    const body: ContainerRunRequest = {
      runId: input.runId,
      threadId: input.threadId,
      messages: input.messages,
      harness: runConfig.harness,
      model: runConfig.model,
      workspace: runConfig.workspace,
      // Serialize the DO's real tools to wire descriptors for the container.
      toolDescriptors: toolDescriptors(runConfig.hostTools),
      // The container calls back here for host-tool EXECUTION. It must be a URL
      // the CONTAINER can reach, so it goes via the Worker's public hostname.
      toolExecUrl: `${origin}/tool-exec/${input.runId}?threadId=${encodeURIComponent(input.threadId)}`,
      toolExecToken: token,
    }
    const response = await sandbox.containerFetch(
      'http://runner/run',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
      RUNNER_PORT,
    )
    if (!response.ok || !response.body) {
      const text = await response.text()
      // Surface as a terminal RUN_ERROR chunk; the base run driver finishes the
      // run as `error` and tailing clients observe it.
      yield {
        type: EventType.RUN_ERROR,
        message: `container runner failed: ${response.status} ${text.slice(0, 200)}`,
      }
      return
    }
    yield* ndjsonToChunks(response.body)
  }

  private ensureRunner(
    sandbox: Sandbox,
    workspace: WorkspaceDefinition,
  ): Promise<void> {
    // Memoize so concurrent runs on this instance share ONE boot.
    if (this.runnerBoot) return this.runnerBoot
    const boot = this.bootRunner(sandbox, workspace).finally(() => {
      this.runnerBoot = undefined
    })
    this.runnerBoot = boot
    return boot
  }

  private secretEnvFromWorkspace(
    workspace: WorkspaceDefinition,
  ): Record<string, string> {
    const env = this.env as Record<string, unknown>
    const out: Record<string, string> = {}
    const secretNames = Object.keys(workspace.secrets ?? {})
    for (const name of secretNames) {
      const value = env[name]
      if (typeof value === 'string' && value !== '') out[name] = value
    }
    return out
  }

  private async bootRunner(
    sandbox: Sandbox,
    workspace: WorkspaceDefinition,
  ): Promise<void> {
    if (await this.runnerHealthy(sandbox)) return
    const secretEnv = this.secretEnvFromWorkspace(workspace)
    if (Object.keys(secretEnv).length > 0) {
      await sandbox.setEnvVars(secretEnv)
    }
    // The Dockerfile copies the bundled runner to /app/container-runner.mjs.
    await sandbox.startProcess(`node /app/container-runner.mjs`, {
      env: { RUNNER_PORT: String(RUNNER_PORT) },
    })
    // Poll until it answers /health (container cold-start + node boot). A run
    // that never comes up surfaces as a failed containerFetch above — not a hang.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await this.runnerHealthy(sandbox)) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    // Include the last probe error so a real misconfig (missing binding, image
    // without the runner) is distinguishable from a plain slow cold-start.
    const detail =
      this.lastProbeError instanceof Error
        ? `: ${this.lastProbeError.message}`
        : this.lastProbeError !== undefined
          ? `: ${String(this.lastProbeError)}`
          : ''
    throw new Error(
      `in-container runner did not become healthy in time${detail}`,
    )
  }

  private async runnerHealthy(sandbox: Sandbox): Promise<boolean> {
    try {
      const res = await sandbox.containerFetch(
        'http://runner/health',
        { method: 'GET' },
        RUNNER_PORT,
      )
      return res.ok
    } catch (error) {
      this.lastProbeError = error
      return false
    }
  }

  protected override handleRoute(
    request: Request,
    parts: Array<string>,
  ): Promise<Response> | Response {
    if (parts[0] === 'tool-exec' && typeof parts[1] === 'string') {
      return this.serveToolExec(parts[1], request)
    }
    return super.handleRoute(request, parts)
  }

  private async serveToolExec(
    runId: string,
    request: Request,
  ): Promise<Response> {
    const state = this.toolExec.get(runId)
    if (!state) return new Response('no active run', { status: 404 })
    if (
      !timingSafeBearerEqualWeb(
        request.headers.get('authorization') ?? undefined,
        state.token,
      )
    ) {
      return new Response('unauthorized', { status: 401 })
    }
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return this.jsonResponse({ error: 'body must be valid JSON' }, 400)
    }
    if (!isToolExecRequest(payload)) {
      return this.jsonResponse({ error: 'body must be { name, args }' }, 400)
    }
    try {
      const result = await executeHostTool(
        state.hostTools,
        payload.name,
        payload.args,
        {
          ...(state.context !== undefined ? { context: state.context } : {}),
          signal: state.abort.signal,
        },
      )
      return this.jsonResponse({ result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.jsonResponse({ error: message }, 500)
    }
  }
}
