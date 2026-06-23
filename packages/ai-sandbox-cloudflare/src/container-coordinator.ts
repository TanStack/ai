/**
 * `ContainerSandboxCoordinator` — the concrete {@link SandboxCoordinator} for
 * the CO-LOCATED ("combined") model: the harness loop AND its MCP tool-bridge
 * run INSIDE the container; this DO stays OUTSIDE as a thin durable coordinator.
 *
 *     Worker (stateless trigger)
 *        → ContainerSandboxCoordinator (this DO: thin durable coordinator)
 *           → Container (runs the in-container harness runner that runs chat())
 *
 * The defining difference from {@link ChatSandboxCoordinator}: this DO does NOT
 * call `chat()` / the adapter itself. It implements the one per-model seam,
 * {@link buildRunStream}, by POSTing `/run` to the in-container runner over the
 * sandbox binding and adapting its NDJSON `StreamChunk` stream — so the base's
 * `RunController` / run-log / streaming tail all work unchanged.
 *
 * TWO channels cross the container ↔ DO boundary; everything else (the MCP
 * transport, native stdin) is in-container localhost:
 *   • events OUT: runner → DO  (NDJSON of StreamChunk, appended to the run-log)
 *   • host-tool EXECUTION: container → DO  (`/tool-exec/:runId`, bearer-gated) —
 *     the REAL tool `execute()` (DB / secrets / app state) lives HERE.
 *
 * The per-run config — host tools, workspace, harness, model — is the subclass's
 * {@link config} method.
 *
 * NOTE: Workers-runtime code — compiles against the real Cloudflare + TanStack
 * AI types; not runtime-verified in this repo (no Workers runtime / container
 * build here). It follows the proven run-log / remote-tool contracts.
 */
import { EventType } from '@tanstack/ai'
import {
  executeHostTool,
  isToolExecRequest,
  toolDescriptors,
} from '@tanstack/ai-sandbox'
import { getSandbox } from '@cloudflare/sandbox'
import { SandboxCoordinator } from './coordinator'
import { timingSafeBearerEqualWeb } from './web-crypto'
import type { StartRunInput } from './coordinator'
import type { ContainerRunRequest, HarnessId } from './protocol'
import type { AnyTool, StreamChunk } from '@tanstack/ai'
import type { WorkspaceDefinition } from '@tanstack/ai-sandbox'
import type { Sandbox } from '@cloudflare/sandbox'

/** Port the in-container runner listens on (matches RUNNER_PORT in the image). */
const RUNNER_PORT = 8080

/**
 * The Env bindings a {@link ContainerSandboxCoordinator} requires. The
 * `tool-exec` URL the CONTAINER calls back on is built from `PUBLIC_HOSTNAME`;
 * the Anthropic key is injected into the container env for the in-container CLI.
 */
export interface ContainerCoordinatorEnv {
  /** The `@cloudflare/sandbox` Sandbox DO namespace (the container hosts). */
  Sandbox: DurableObjectNamespace<Sandbox>
  /** Public hostname the container uses to reach the DO's `/tool-exec` endpoint. */
  PUBLIC_HOSTNAME: string
  /** Anthropic key injected into the CONTAINER env for the in-container CLI. */
  ANTHROPIC_API_KEY: string
}

/** What {@link ContainerSandboxCoordinator.config} returns for one run. */
export interface ContainerRunConfig {
  /**
   * The REAL host tools. Their `execute()` runs HERE, in the DO — the
   * in-container agent only ever reaches them via `/tool-exec/:runId`. Only the
   * serialized descriptors cross to the container.
   */
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

/**
 * Adapt the runner's NDJSON response body into an `AsyncIterable<StreamChunk>`
 * so the DO can drive it through the SAME base `RunController` / `pipeToRunLog`
 * the DO-drives coordinator uses — terminal-status handling, RUN_ERROR
 * detection, and never-rejects semantics all come for free. A malformed line
 * (unparseable JSON, or valid JSON that isn't a chunk) is surfaced as a terminal
 * RUN_ERROR chunk, never silently dropped.
 */
async function* ndjsonToChunks(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<StreamChunk> {
  const reader = body.getReader()
  // Decode incrementally with `stream: true` so a multi-byte char split across
  // two reads is reassembled correctly (TextDecoderStream's DOM/Workers typings
  // disagree across versions; a plain TextDecoder is version-robust and no-cast).
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

/**
 * Parse one NDJSON line into a {@link StreamChunk}, turning a truncated/garbled
 * line (a crashed container's last write) or a non-chunk object into a terminal
 * RUN_ERROR chunk rather than throwing or silently dropping it.
 */
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
  /**
   * Live per-run tool-exec tokens, keyed by runId. In-memory by design: a run's
   * tool-exec endpoint is only reachable while the run is in flight, and
   * `ctx.waitUntil(done)` keeps THIS instance alive for the run's lifetime, so
   * the container's callbacks always hit the instance that minted the token.
   */
  private readonly toolExec = new Map<string, ToolExecState>()

  /**
   * In-flight runner boot, memoized so two runs starting near-simultaneously on
   * this instance don't both spawn `container-runner` (the second would hit
   * EADDRINUSE on RUNNER_PORT). Cleared once boot settles.
   */
  private runnerBoot?: Promise<void>

  /** Last `/health` probe error, surfaced if the runner never comes up. */
  private lastProbeError?: unknown

  // ===========================================================================
  // Subclass seam: the per-run configuration
  // ===========================================================================

  /**
   * Resolve the host tools, workspace, harness, and model for one run.
   * Implemented by the app subclass (or supplied by
   * {@link createCloudflareSandboxAgent}).
   */
  protected abstract config(input: StartRunInput): ContainerRunConfig

  // ===========================================================================
  // The one per-model seam: drive the in-container runner
  // ===========================================================================

  /**
   * Mint the per-run tool-exec token, POST `/run` to the in-container runner, and
   * yield its NDJSON chunks. The token is registered BEFORE the container is told
   * to run, so a tool callback can never arrive before the token exists.
   */
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

  /**
   * Once the run is terminal, abort any host tool still running on its behalf
   * (so a tool that outlived the run doesn't leak), then drop the per-run state.
   */
  protected override onRunSettled(runId: string): void {
    const state = this.toolExec.get(runId)
    if (state) state.abort.abort()
    this.toolExec.delete(runId)
  }

  /**
   * POST `/run` to the in-container runner and yield its NDJSON chunks. The DO
   * reaches the runner DIRECTLY over the sandbox binding (`containerFetch` to
   * RUNNER_PORT) — this internal channel needs no public hostname. The runner
   * gets the host-tool descriptors plus the `/tool-exec` URL + token it calls
   * back on.
   */
  private async *driveContainer(
    input: StartRunInput,
    runConfig: ContainerRunConfig,
    token: string,
  ): AsyncIterable<StreamChunk> {
    const sandbox = getSandbox(this.env.Sandbox, input.threadId)
    await this.ensureRunner(sandbox)
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
      toolExecUrl: `https://${this.env.PUBLIC_HOSTNAME}/tool-exec/${input.runId}?threadId=${encodeURIComponent(input.threadId)}`,
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

  /**
   * Ensure the in-container runner is listening on RUNNER_PORT. The base image's
   * ENTRYPOINT is the sandbox CONTROL server, not our runner — so we start the
   * bundled runner as a background process via that control server. Idempotent
   * for a thread-reused container: if `/health` already answers, we skip spawn.
   */
  private ensureRunner(sandbox: Sandbox): Promise<void> {
    // Memoize so concurrent runs on this instance share ONE boot.
    if (this.runnerBoot) return this.runnerBoot
    const boot = this.bootRunner(sandbox).finally(() => {
      this.runnerBoot = undefined
    })
    this.runnerBoot = boot
    return boot
  }

  private async bootRunner(sandbox: Sandbox): Promise<void> {
    if (await this.runnerHealthy(sandbox)) return
    // Inject the Anthropic key into the container env so the in-container CLI can
    // authenticate. The key never lands in argv or the run-log.
    await sandbox.setEnvVars({ ANTHROPIC_API_KEY: this.env.ANTHROPIC_API_KEY })
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

  // ===========================================================================
  // The host-tool-exec callback (`/tool-exec/:runId`), from the base fetch
  // ===========================================================================

  protected override handleRoute(
    request: Request,
    parts: Array<string>,
  ): Promise<Response> | Response {
    if (parts[0] === 'tool-exec' && typeof parts[1] === 'string') {
      return this.serveToolExec(parts[1], request)
    }
    return super.handleRoute(request, parts)
  }

  /**
   * Execute a host tool the in-container agent called back for. The token gates
   * it (constant-time Web Crypto compare); the REAL tool's `execute()` runs here
   * via {@link executeHostTool} and its raw result returns as `{ result }`. An
   * unknown tool or a thrown `execute()` is surfaced as a 4xx/5xx, never masked.
   */
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
