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
    const sandbox = getSandbox(env.Sandbox, input.threadId, {
      transport: 'rpc',
    })
    const tunnel = await sandbox.tunnels.get(port)
    return { url: tunnel.url }
  })
}
