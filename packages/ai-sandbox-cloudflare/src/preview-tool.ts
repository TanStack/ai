/**
 * The browser-preview capability, as reusable building blocks rather than
 * per-app glue: a `chat()` server tool that mints a preview URL for a dev server
 * running inside the sandbox, plus the system-prompt guidance an agent needs to
 * produce a preview that works.
 *
 * Previews go over a **Cloudflare quick tunnel** (`sandbox.tunnels.get(port)` →
 * `https://<name>.trycloudflare.com`), served by `cloudflared` INSIDE the sandbox.
 * We deliberately do NOT use `exposePort` + `proxyToSandbox` here: that routes the
 * preview through the Worker's own origin, which in local dev is the example's Vite
 * dev server — and Vite's middleware then serves the preview's module/asset
 * requests (`/@vite/client`, `/src/*`, `/@fs/*`) from the HOST instead of the
 * container, breaking the page. A tunnel bypasses the Vite port entirely, needs no
 * custom domain on a deploy, and forwards WebSockets (so the app's HMR works).
 *
 * Both exports belong to THIS package because the transport is its concern, not any
 * particular app's. Wire them explicitly into your agent:
 *
 * ```ts
 * import {
 *   exposePreviewTool,
 *   PREVIEW_GUIDANCE,
 * } from '@tanstack/ai-sandbox-cloudflare/agent'
 *
 * createCloudflareSandboxAgent({
 *   adapter: () => claudeCodeText('sonnet'),
 *   tools: (input, env) => [exposePreviewTool(input, env)],
 *   systemPrompts: [PREVIEW_GUIDANCE],
 * })
 * ```
 *
 * Workers-only (imports `@cloudflare/sandbox`) — exported from the `/agent` entry.
 */
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { getSandbox } from '@cloudflare/sandbox'
import type { Sandbox } from '@cloudflare/sandbox'
import type { StartRunInput } from './coordinator'

/**
 * The minimum env an {@link exposePreviewTool} needs: the Sandbox namespace it
 * addresses the run's container in. `SandboxAgentEnv` satisfies this structurally,
 * so the factory's `tools` resolver passes its env straight in.
 */
export interface PreviewToolEnv {
  Sandbox: DurableObjectNamespace<Sandbox>
}

/**
 * System-prompt guidance for any agent that exposes a dev server as a browser
 * preview. App-agnostic: the only requirement a quick tunnel imposes is that the
 * dev server accept the tunnel hostname (Vite/webpack reject unknown hosts by
 * default), so the rule is "bind wide + allow all hosts", not "disable HMR" — the
 * tunnel forwards WebSockets, so HMR works.
 */
export const PREVIEW_GUIDANCE: string = [
  'PREVIEW SERVERS: to show the user a running web app, start its dev server bound',
  'to 0.0.0.0 on a port OTHER than 3000 (3000 is reserved by the sandbox control',
  'plane), then call the `exposePreview` tool with that port. It returns a public',
  'Cloudflare quick-tunnel URL (https://<name>.trycloudflare.com) served straight',
  'from the sandbox — no custom domain needed, and HMR / live-reload WebSockets',
  'work through the tunnel (you do NOT need to disable HMR). The ONE requirement:',
  'the dev server must ACCEPT the tunnel hostname, which servers reject by default,',
  'so allow all hosts in its config before starting:',
  '• Vite — `server: { host: true, allowedHosts: true }` in vite.config.',
  "• webpack-dev-server — `allowedHosts: 'all'` (and `host: '0.0.0.0'`).",
  '• Other dev servers — bind 0.0.0.0 and allow all hosts equivalently.',
  'Once it is listening, call `exposePreview` with that port, then share the URL.',
].join('\n')

const LOCAL_PROBE_TIMEOUT_MS = 5_000
// Fresh quick tunnels need a few seconds of DNS/edge propagation, hence retries.
const EDGE_PROBE_ATTEMPTS = 5
const EDGE_PROBE_BASE_DELAY_MS = 250
const EDGE_PROBE_FETCH_TIMEOUT_MS = 3_000

/**
 * Probe the port INSIDE the sandbox via `containerFetch`. Returns the HTTP
 * status when a listener answered (any response — 4xx/5xx included — proves one
 * exists), or the failure symptom (a string) when nothing did.
 */
async function localProbe(
  sandbox: Sandbox,
  port: number,
): Promise<number | string> {
  // ponytail: race instead of AbortSignal — a signal doesn't serialize across the
  // sandbox RPC boundary, and a lost in-flight probe response is harmless.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`no response within ${LOCAL_PROBE_TIMEOUT_MS}ms`)),
      LOCAL_PROBE_TIMEOUT_MS,
    ),
  )
  try {
    const res = await Promise.race([
      sandbox.containerFetch('http://preview/', { method: 'HEAD' }, port),
      timeout,
    ])
    return res.status
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

/**
 * Probe a tunnel URL through the public edge with bounded retries. Only 502/530
 * — Cloudflare's tunnel/origin-unreachable signatures — mark the URL as
 * unreachable (401/403/404 prove the server answered, and `redirect: 'manual'`
 * keeps a login redirect from probing some other site), and even those are
 * trusted when the app answered the SAME status locally, so an app's own
 * 502/530 never gets its healthy tunnel destroyed. Success is `null`; repeated
 * failure returns the last symptom.
 */
async function edgeProbeFailure(
  url: string,
  localStatus: number,
): Promise<string | null> {
  let lastFailure = 'no response'
  for (let attempt = 0; attempt < EDGE_PROBE_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, EDGE_PROBE_BASE_DELAY_MS * 2 ** (attempt - 1)),
      )
    }
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: AbortSignal.timeout(EDGE_PROBE_FETCH_TIMEOUT_MS),
      })
      if (
        (res.status !== 502 && res.status !== 530) ||
        res.status === localStatus
      ) {
        return null
      }
      lastFailure = `HTTP ${res.status}`
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
  }
  return lastFailure
}

/**
 * Build the `exposePreview` server tool for one run. Starting a tunnel is a
 * HOST-side call on the Sandbox DO stub, so an in-sandbox agent cannot make it from
 * bash — it calls this bridged tool instead. We address the run's container by
 * `threadId` and open (or reuse) a quick tunnel to the given port.
 *
 * Closes over the run's `input` + `env`, so build it inside the `tools` resolver
 * (`tools: (input, env) => [exposePreviewTool(input, env)]`).
 */
export function exposePreviewTool(input: StartRunInput, env: PreviewToolEnv) {
  return toolDefinition({
    name: 'exposePreview',
    description:
      'Expose a port a dev server is listening on inside the sandbox and return a public preview URL (a Cloudflare quick tunnel) to show the user. Call this AFTER the server is up. The dev server must allow all hosts (e.g. Vite `server.allowedHosts: true`) so it accepts the tunnel hostname.',
    inputSchema: z.object({
      port: z
        .number()
        .int()
        .min(1024)
        .max(65535)
        .describe('The port the dev server is listening on, e.g. 5173.'),
    }),
  }).server(async ({ port }) => {
    // `sandbox.tunnels` only exists on the RPC transport (on HTTP/WebSocket it's a
    // stub that throws "requires the RPC transport"), so we must obtain the stub
    // with `transport: 'rpc'`. IMPORTANT: this must MATCH how the sandbox was
    // created — pass `transport: 'rpc'` on EVERY `getSandbox()` for this id (in your
    // sandbox provider too), or the differing transport disconnects the run's active
    // client. See the SDK `SandboxOptions.transport` note.
    const sandbox = getSandbox(env.Sandbox, input.threadId, {
      transport: 'rpc',
    })
    // Gate tunnel work on a live listener: a fresh tunnel to a dead port is still
    // a dead preview, and the failure the agent can FIX is "start the server".
    const local = await localProbe(sandbox, port)
    if (typeof local === 'string') {
      throw new Error(
        `No server is listening on port ${port} inside the sandbox (${local}). Start the dev server (bound to 0.0.0.0:${port}) first, then retry exposePreview.`,
      )
    }
    // A Cloudflare quick tunnel (`*.trycloudflare.com`) run by `cloudflared` INSIDE
    // the sandbox: it bypasses the local Vite dev server's port entirely (so Vite
    // can't hijack the preview's asset requests) and needs no custom domain on a
    // deploy. `get(port)` is idempotent per port. See the Sandbox SDK `tunnels` API.
    const tunnel = await sandbox.tunnels.get(port)
    const staleSymptom = await edgeProbeFailure(tunnel.url, local)
    if (staleSymptom === null) return { url: tunnel.url }
    // Local server healthy but the edge kept answering 502/530: the cached tunnel
    // record is suspect. Refresh, bounded to ONE so we never churn tunnels.
    await sandbox.tunnels.destroy(port)
    const fresh = await sandbox.tunnels.get(port)
    const freshSymptom = await edgeProbeFailure(fresh.url, local)
    if (freshSymptom === null) {
      return {
        url: fresh.url,
        note: `The tunnel for port ${port} was stale, so it was replaced. Any previously shared preview URL for this port is dead — share this new URL instead.`,
      }
    }
    throw new Error(
      `Port ${port} is serving inside the sandbox, but its preview tunnel never became reachable (old tunnel: ${staleSymptom}; replacement tunnel: ${freshSymptom}). Retry exposePreview, and if it keeps failing, restart the dev server and try again.`,
    )
  })
}
