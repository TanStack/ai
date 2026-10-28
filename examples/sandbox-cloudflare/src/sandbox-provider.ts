/**
 * `namedCloudflareSandbox` — like the package's `cloudflareSandbox()` provider, but
 * pins the container Durable Object to a KNOWN name instead of a random UUID.
 *
 * Why: to show the app the agent builds, the `exposePreview` host tool opens a quick
 * tunnel via `getSandbox(binding, threadId).tunnels.get(port)`. That has to target
 * the SAME container the agent's dev server runs in — so the host needs to address
 * it by a name it knows. The default provider names the container with a random
 * UUID the host never sees; this one names it deterministically (we pass the run's
 * `threadId`), so the tool reaches the same container.
 *
 * Pinning by `threadId` is also strictly better for `reuse: 'thread'`: the container
 * is addressable across Durable Object eviction, not just within one live instance.
 */
import { getSandbox } from '@cloudflare/sandbox'
import {
  CLOUDFLARE_CAPS,
  CloudflareHandle,
} from '@tanstack/ai-sandbox-cloudflare'
import type { Sandbox } from '@cloudflare/sandbox'
import type {
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

const WORKDIR = '/workspace'

// `sandbox.tunnels` (preview URLs) only exists on the RPC transport, and the
// transport must be identical for every `getSandbox()` of an id — so create,
// resume, and destroy all pass it. (The package's own `cloudflareSandbox` provider
// defaults to `'rpc'` for the same reason; this custom provider mirrors it.)
const SANDBOX_OPTIONS = { transport: 'rpc' } as const

export function namedCloudflareSandbox(
  binding: DurableObjectNamespace<Sandbox>,
  name: string,
  previewHostname?: string,
): SandboxProvider {
  return {
    name: 'cloudflare-named',
    capabilities: () => CLOUDFLARE_CAPS,
    async create(input: SandboxCreateInput): Promise<SandboxHandle> {
      const sandbox = getSandbox(binding, name, SANDBOX_OPTIONS)
      if (input.env && Object.keys(input.env).length > 0) {
        await sandbox.setEnvVars(input.env)
      }
      await sandbox.mkdir(WORKDIR, { recursive: true })
      return new CloudflareHandle(name, sandbox, WORKDIR, previewHostname)
    },
    resume: (input: SandboxResumeInput): Promise<SandboxHandle> =>
      Promise.resolve(
        new CloudflareHandle(
          input.id,
          getSandbox(binding, input.id, SANDBOX_OPTIONS),
          WORKDIR,
          previewHostname,
        ),
      ),
    async destroy(input: SandboxDestroyInput): Promise<void> {
      await getSandbox(binding, input.id, SANDBOX_OPTIONS).destroy()
    },
  }
}
