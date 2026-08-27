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

export interface SandboxAgentEnv
  extends ChatCoordinatorEnv, ContainerCoordinatorEnv {
  /** This coordinator DO's own namespace (so the Worker can address it). */
  RUN_COORDINATOR: DurableObjectNamespace<SandboxCoordinator<SandboxAgentEnv>>
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
  systemPrompts?: Array<SystemPrompt>
  sandbox?: (input: StartRunInput, env: TEnv) => SandboxDefinition
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
      previewHostname: resolvePreviewHost(env, input),
    }),
    workspace: workspace ?? defineWorkspace({ source: { type: 'none' } }),
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
