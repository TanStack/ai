/**
 * `namedCloudflareSandbox` — like the package's `cloudflareSandbox()` provider, but
 * pins the container Durable Object to a KNOWN name instead of a random UUID.
 *
 * Why: to show the app the agent builds, we need a preview URL, which is minted by
 * a host-side `sandbox.exposePort(port, { hostname })` call. That call has to target
 * the SAME container the agent's dev server runs in — so the host needs to address
 * it by a name it knows. The default provider names the container with a random
 * UUID the host never sees; this one names it deterministically (we pass the run's
 * `threadId`), so the `exposePreview` host tool in `agent.ts` can reach it.
 *
 * Pinning by `threadId` is also strictly better for `reuse: 'thread'`: the container
 * is addressable across Durable Object eviction, not just within one live instance.
 */
import { getSandbox } from '@cloudflare/sandbox'
import { CLOUDFLARE_CAPS, CloudflareHandle } from '@tanstack/ai-sandbox-cloudflare'
import type { Sandbox } from '@cloudflare/sandbox'
import type {
  SandboxCreateInput,
  SandboxDestroyInput,
  SandboxHandle,
  SandboxProvider,
  SandboxResumeInput,
} from '@tanstack/ai-sandbox'

const WORKDIR = '/workspace'

export function namedCloudflareSandbox(
  binding: DurableObjectNamespace<Sandbox>,
  name: string,
  previewHostname: string,
): SandboxProvider {
  return {
    name: 'cloudflare-named',
    capabilities: () => CLOUDFLARE_CAPS,
    async create(input: SandboxCreateInput): Promise<SandboxHandle> {
      const sandbox = getSandbox(binding, name)
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
          getSandbox(binding, input.id),
          WORKDIR,
          previewHostname,
        ),
      ),
    async destroy(input: SandboxDestroyInput): Promise<void> {
      await getSandbox(binding, input.id).destroy()
    },
  }
}
