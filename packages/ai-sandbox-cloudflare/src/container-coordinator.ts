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
import { executeHostTool, toolDescriptors } from '@tanstack/ai-sandbox'
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
}

/** Per-run tool-exec token; gates `/tool-exec/:runId` for that run only. */
interface ToolExecState {
  token: string
  hostTools: Array<AnyTool>
}

/** Wire shape of a `/tool-exec/:runId` body: `{ name, args }`. */
interface ToolExecRequest {
  name: string
  args: unknown
}

function isToolExecRequest(value: unknown): value is ToolExecRequest {
  return (
    value !== null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

/** Narrow one NDJSON line into a StreamChunk (project rule: no `as`). */
function isStreamChunk(value: unknown): value is StreamChunk {
  return value !== null && typeof value === 'object' && 'type' in value
}

/**
 * Adapt the runner's NDJSON response body into an `AsyncIterable<StreamChunk>`
 * so the DO can drive it through the SAME base `RunController` / `pipeToRunLog`
 * the DO-drives coordinator uses — terminal-status handling, RUN_ERROR
 * detection, and never-rejects semantics all come for free. A malformed line is
 * surfaced as a terminal RUN_ERROR chunk, never silently dropped.
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
      const parsed: unknown = JSON.parse(line)
      if (!isStreamChunk(parsed)) {
        yield {
          type: EventType.RUN_ERROR,
          message: 'runner sent a non-chunk line',
        }
        return
      }
      yield parsed
    }
    result = await reader.read()
  }
  buffer += decoder.decode()
  const tail = buffer.trim()
  if (tail !== '') {
    const parsed: unknown = JSON.parse(tail)
    if (isStreamChunk(parsed)) yield parsed
  }
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
    this.toolExec.set(input.runId, { token, hostTools: runConfig.hostTools })
    return this.driveContainer(input, runConfig, token)
  }

  /** Drop the per-run tool-exec token once the run is terminal. */
  protected override onRunSettled(runId: string): void {
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
  private async ensureRunner(sandbox: Sandbox): Promise<void> {
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
    throw new Error('in-container runner did not become healthy in time')
  }

  private async runnerHealthy(sandbox: Sandbox): Promise<boolean> {
    try {
      const res = await sandbox.containerFetch(
        'http://runner/health',
        { method: 'GET' },
        RUNNER_PORT,
      )
      return res.ok
    } catch {
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
    const payload: unknown = await request.json()
    if (!isToolExecRequest(payload)) {
      return this.jsonResponse({ error: 'body must be { name, args }' }, 400)
    }
    try {
      const result = await executeHostTool(
        state.hostTools,
        payload.name,
        payload.args,
      )
      return this.jsonResponse({ result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.jsonResponse({ error: message }, 500)
    }
  }
}
