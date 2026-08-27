import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { getSandbox } from '@cloudflare/sandbox'
import type { Sandbox } from '@cloudflare/sandbox'
import type { StartRunInput } from './coordinator'

export interface PreviewToolEnv {
  Sandbox: DurableObjectNamespace<Sandbox>
}

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
