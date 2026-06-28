/**
 * `createCloudflareSandboxAgent` — the headline DX: one configured function call
 * returns the Durable Object coordinator, the Sandbox DO, and the Worker fetch
 * handler, so a Cloudflare app's whole `worker.ts` is just export wiring:
 *
 * ```ts
 * const agent = createCloudflareSandboxAgent({
 *   adapter: () => claudeCodeText('sonnet'),
 * })
 * export const RunCoordinator = agent.Coordinator
 * export const Sandbox = agent.Sandbox
 * export default agent.worker
 * ```
 *
 * Two modes, switched by `config.mode`:
 *  - `'do-drives'` (default) → a {@link ChatSandboxCoordinator}: the DO runs
 *    `chat()` itself and hosts the MCP tool-bridge.
 *  - `'colocated'` → a {@link ContainerSandboxCoordinator}: an in-container
 *    runner runs `chat()`; the DO is a thin coordinator that executes host tools.
 *
 * Env bindings (set in `wrangler.jsonc`):
 *  - `RUN_COORDINATOR` — this coordinator DO's own namespace (so the Worker can
 *    address it by `threadId`). Class name: whatever you export `Coordinator` as.
 *  - `Sandbox` — the `@cloudflare/sandbox` Sandbox DO namespace (the container
 *    hosts). Bind the exported `Sandbox` class.
 *  - `PUBLIC_HOSTNAME` — OPTIONAL. Hostname the CONTAINER uses to reach the Worker's
 *    tool-bridge / tool-exec endpoint. Unset → request-derived (local dev →
 *    `host.docker.internal`). See `resolveBridgeOrigin`.
 *  - `PREVIEW_HOSTNAME` — OPTIONAL. Custom domain (with a `*.<domain>` route) for
 *    browser-facing `exposePort` preview URLs. Unset → request-derived (local dev →
 *    `localhost`); REQUIRED on a `*.workers.dev` deploy, which has no wildcard
 *    subdomains. See `resolvePreviewHost`.
 *  - The harness's API key (`ANTHROPIC_API_KEY` for Claude Code, `CODEX_API_KEY` for
 *    codex, …) — supplied by YOUR app, never by the package. Declare it as a secret
 *    on the run's workspace (via a `sandbox`/`workspace` resolver) and add the field
 *    to your own env type; the coordinator injects each declared secret into the
 *    sandbox env by name. The package itself is harness-agnostic and binds no key.
 *
 * NOTE: Workers-runtime code — compiles against the real Cloudflare + TanStack
 * AI types; not runtime-verified in this repo (no Workers runtime here).
 */
import { defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import { Sandbox } from '@cloudflare/sandbox'
import { cloudflareSandbox } from './provider'
import { ChatSandboxCoordinator } from './chat-coordinator'
import { ContainerSandboxCoordinator } from './container-coordinator'
import { createSandboxAgentWorker } from './worker'
import { resolvePreviewHost } from './coordinator'
import type { ChatCoordinatorEnv, ChatRunConfig } from './chat-coordinator'
import type {
  ContainerCoordinatorEnv,
  ContainerRunConfig,
} from './container-coordinator'
import type { HarnessId } from './protocol'
import type { SandboxCoordinator, StartRunInput } from './coordinator'
import type { AnyTextAdapter, AnyTool, SystemPrompt } from '@tanstack/ai'
import type {
  SandboxDefinition,
  WorkspaceDefinition,
} from '@tanstack/ai-sandbox'

/**
 * The base Env every generated app binds: the coordinator's own namespace, the
 * Sandbox namespace, the OPTIONAL bridge/preview hostnames (request-derived when
 * unset), and the Anthropic key. The two modes extend this with exactly the
 * coordinator base each one requires.
 */
export interface SandboxAgentEnv
  extends ChatCoordinatorEnv, ContainerCoordinatorEnv {
  /** This coordinator DO's own namespace (so the Worker can address it). */
  RUN_COORDINATOR: DurableObjectNamespace<SandboxCoordinator<SandboxAgentEnv>>
  /**
   * Custom domain (with a `*.<domain>` route) for browser-facing `exposePort`
   * preview URLs. Optional: unset → request-derived (local dev → `localhost`).
   * REQUIRED on a `*.workers.dev` deploy (no wildcard subdomains). Distinct from
   * `PUBLIC_HOSTNAME`, which is the CONTAINER→Worker bridge host. See
   * {@link resolvePreviewHost}.
   */
  PREVIEW_HOSTNAME?: string
}

/** Shared config across both modes. */
interface BaseAgentConfig<TEnv extends SandboxAgentEnv> {
  /** chat()-provided server tools, resolved per run (DO-drives: bridged over MCP). */
  tools?: (input: StartRunInput, env: TEnv) => Array<AnyTool>
}

/** DO-drives config: the DO runs `chat()` with the given adapter. */
export interface DoDrivesAgentConfig<
  TEnv extends SandboxAgentEnv,
> extends BaseAgentConfig<TEnv> {
  mode?: 'do-drives'
  /** The harness/text adapter `chat()` runs, resolved per run. */
  adapter: (input: StartRunInput, env: TEnv) => AnyTextAdapter
  /**
   * Base system prompts prepended to every run's `chat()` (DO-drives only — the DO
   * runs `chat()` itself). The natural home for transport-level guidance the agent
   * needs regardless of what it builds — e.g. `systemPrompts: [PREVIEW_GUIDANCE]`
   * so previews don't reload-loop. See {@link PREVIEW_GUIDANCE}.
   */
  systemPrompts?: Array<SystemPrompt>
  /**
   * The sandbox the agent runs in, resolved per run. When omitted, a default
   * Cloudflare sandbox (one per thread, no source clone, NO auth secrets) is built
   * from the `Sandbox` binding and the resolved preview host, optionally
   * bootstrapping `workspace`. Supply the harness's API key either here (a custom
   * `sandbox` resolver whose workspace declares the secret) or via `workspace`
   * below — the package binds no key of its own.
   */
  sandbox?: (input: StartRunInput, env: TEnv) => SandboxDefinition
  /**
   * Workspace for the default sandbox (ignored when `sandbox` is provided). This is
   * where a default-sandbox app declares its harness auth, e.g.
   * `defineWorkspace({ source: { type: 'none' }, secrets: createSecrets({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }) })`.
   */
  workspace?: WorkspaceDefinition
}

/** Co-located config: an in-container runner runs `chat()`. */
export interface ColocatedAgentConfig<
  TEnv extends SandboxAgentEnv,
> extends BaseAgentConfig<TEnv> {
  mode: 'colocated'
  /** Which in-sandbox harness the runner spawns. */
  harness: HarnessId
  /** Model id passed to that harness. */
  model: string
  /** Workspace the in-container runner bootstraps for the agent. */
  workspace: WorkspaceDefinition
}

export type CloudflareSandboxAgentConfig<TEnv extends SandboxAgentEnv> =
  | DoDrivesAgentConfig<TEnv>
  | ColocatedAgentConfig<TEnv>

/** What {@link createCloudflareSandboxAgent} returns: the app's whole worker. */
export interface CloudflareSandboxAgent<TEnv extends SandboxAgentEnv> {
  /** The coordinator Durable Object class — export as your `RUN_COORDINATOR` binding. */
  Coordinator: new (
    ctx: DurableObjectState,
    env: TEnv,
  ) => SandboxCoordinator<TEnv>
  /** The `@cloudflare/sandbox` Sandbox DO class — export for the `Sandbox` binding. */
  Sandbox: typeof Sandbox
  /** The Worker fetch handler — `export default` it. */
  worker: ExportedHandler<TEnv>
}

/** Build the default per-thread Cloudflare sandbox for the DO-drives mode. */
function defaultSandbox<TEnv extends SandboxAgentEnv>(
  env: TEnv,
  input: StartRunInput,
  workspace: WorkspaceDefinition | undefined,
): SandboxDefinition {
  return defineSandbox({
    id: 'cf-edge-agent',
    provider: cloudflareSandbox({
      binding: env.Sandbox,
      // Browser-facing preview host: `PREVIEW_HOSTNAME` if set, else derived from
      // the trigger request (local dev → `localhost`; deployed → a custom domain,
      // since `*.workers.dev` has no wildcard). See `resolvePreviewHost`.
      previewHostname: resolvePreviewHost(env, input),
    }),
    workspace:
      workspace ??
      // The container image ships the harness CLI; no source to clone, and NO auth
      // secrets — the package is harness-agnostic, so it can't know which key the
      // CLI needs. Supply the harness's API key via a `workspace` with `secrets`
      // (or a custom `sandbox` resolver), e.g.:
      //   workspace: defineWorkspace({
      //     source: { type: 'none' },
      //     secrets: createSecrets({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }),
      //   })
      defineWorkspace({ source: { type: 'none' } }),
    // One sandbox per thread, so a follow-up run resumes the same workspace.
    lifecycle: { reuse: 'thread' },
  })
}

/** Resolve the coordinator DO that owns a thread's runs (`RUN_COORDINATOR`). */
function resolveCoordinator<TEnv extends SandboxAgentEnv>(
  env: TEnv,
  threadId: string,
): DurableObjectStub<SandboxCoordinator<TEnv>> {
  return env.RUN_COORDINATOR.get(env.RUN_COORDINATOR.idFromName(threadId))
}

export function createCloudflareSandboxAgent<
  TEnv extends SandboxAgentEnv = SandboxAgentEnv,
>(config: CloudflareSandboxAgentConfig<TEnv>): CloudflareSandboxAgent<TEnv> {
  const worker = createSandboxAgentWorker<TEnv>(resolveCoordinator)

  if (config.mode === 'colocated') {
    const colocated = config
    class ConfiguredContainerCoordinator extends ContainerSandboxCoordinator<TEnv> {
      protected override config(input: StartRunInput): ContainerRunConfig {
        return {
          hostTools: colocated.tools?.(input, this.env) ?? [],
          workspace: colocated.workspace,
          harness: colocated.harness,
          model: colocated.model,
        }
      }
    }
    return { Coordinator: ConfiguredContainerCoordinator, Sandbox, worker }
  }

  const doDrives = config
  class ConfiguredChatCoordinator extends ChatSandboxCoordinator<TEnv> {
    protected override config(input: StartRunInput): ChatRunConfig {
      const tools = doDrives.tools?.(input, this.env)
      return {
        adapter: doDrives.adapter(input, this.env),
        sandbox:
          doDrives.sandbox?.(input, this.env) ??
          defaultSandbox(this.env, input, doDrives.workspace),
        ...(tools !== undefined ? { tools } : {}),
        ...(doDrives.systemPrompts !== undefined
          ? { systemPrompts: doDrives.systemPrompts }
          : {}),
      }
    }
  }
  return { Coordinator: ConfiguredChatCoordinator, Sandbox, worker }
}
