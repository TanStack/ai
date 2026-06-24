/**
 * `@tanstack/ai-sandbox-cloudflare/agent` — the Workers-runtime building blocks
 * for running a TanStack AI sandbox agent on Cloudflare with minimal app code.
 *
 * The headline API is {@link createCloudflareSandboxAgent}: one configured
 * function call returns the Durable Object coordinator + the Sandbox DO + the
 * Worker fetch handler, so an app's `worker.ts` is just export wiring. The
 * coordinator base classes, the concrete coordinators, the Worker factory, and
 * the durable run-log are exported too for apps that want to compose them
 * directly.
 *
 * This entry imports `cloudflare:workers` and is Workers-only — keep it out of
 * the node-importable main entry (`@tanstack/ai-sandbox-cloudflare`).
 */

// The headline factory + its config/result types.
export { createCloudflareSandboxAgent } from './factory'
export type {
  CloudflareSandboxAgent,
  CloudflareSandboxAgentConfig,
  DoDrivesAgentConfig,
  ColocatedAgentConfig,
  SandboxAgentEnv,
} from './factory'

// The abstract base + its run input + the host resolvers (so apps that build their
// own host tools / sandbox providers resolve the callback hosts the same way the
// coordinators do): `resolveBridgeOrigin` for the container→Worker bridge/tool-exec
// origin, `resolvePreviewHost` for browser-facing `exposePort` preview URLs.
export {
  SandboxCoordinator,
  resolveBridgeOrigin,
  resolvePreviewHost,
} from './coordinator'
export type { StartRunInput } from './coordinator'

// The two concrete coordinators + their per-run config + Env types.
export { ChatSandboxCoordinator } from './chat-coordinator'
export type { ChatCoordinatorEnv, ChatRunConfig } from './chat-coordinator'
export { ContainerSandboxCoordinator } from './container-coordinator'
export type {
  ContainerCoordinatorEnv,
  ContainerRunConfig,
} from './container-coordinator'

// The shared `POST /run` wire contract (built by the coordinator, validated by
// the `/runner` entry). Defined runtime-agnostically in `./protocol`.
export { parseContainerRunRequest } from './protocol'
export type { ContainerRunRequest, HarnessId } from './protocol'

// The Worker fetch-handler factory + its resolver type.
export { createSandboxAgentWorker } from './worker'
export type { ResolveCoordinator } from './worker'

// The durable run-log + the Web Crypto bearer helper (for direct composition).
export { DurableObjectRunEventLog } from './run-log-do'
export { timingSafeBearerEqualWeb } from './web-crypto'
