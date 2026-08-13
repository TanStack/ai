/**
 * ngrok-backed tool-bridge provisioner — make the host tool bridge reachable
 * from REMOTE sandboxes (Daytona, Vercel, …) while developing locally.
 *
 * The default bridge ({@link nodeHttpBridgeProvisioner}) binds `localhost`, so
 * only same-machine providers (local-process, Docker) can reach it. A cloud
 * sandbox is a remote VM and can't dial your machine's loopback. This
 * provisioner stands up the normal loopback bridge, opens an ngrok tunnel to its
 * port, and advertises the public `https://…/mcp` URL (with the same per-run
 * bearer token) to the sandbox — so bridged tools / code mode work there too.
 *
 * In PRODUCTION you don't need this: a deployed orchestrator already has a public
 * URL, so a provisioner can advertise that directly (derived from the request).
 * ngrok is the local-dev stand-in for "the orchestrator is reachable".
 *
 * `@ngrok/ngrok` is an OPTIONAL peer dependency — it's loaded lazily, so this
 * subpath imports cleanly without it; only {@link withNgrokBridge} /
 * {@link ngrokBridgeProvisioner} require it at run time. Set `NGROK_AUTHTOKEN`.
 */
import { defineChatMiddleware } from '@tanstack/ai'
import { provideToolBridgeProvisioner } from './capabilities'
import { startHostToolBridge } from './tool-bridge'
import type { ToolBridgeProvisioner } from './tool-bridge'

/** Whether ngrok tunnelling is configured (an authtoken is present). */
export function ngrokConfigured(): boolean {
  return Boolean(process.env.NGROK_AUTHTOKEN)
}

/**
 * A {@link ToolBridgeProvisioner} that tunnels the loopback bridge through ngrok
 * (one ephemeral tunnel per run; both are torn down together). Requires the
 * optional `@ngrok/ngrok` peer dependency and `NGROK_AUTHTOKEN`.
 */
export const ngrokBridgeProvisioner: ToolBridgeProvisioner = {
  async provision(tools, options) {
    // Lazy + optional: only needed when this provisioner actually runs.
    const { default: ngrok } = await import('@ngrok/ngrok')
    const { provider: _provider, ...core } = options
    const bridge = await startHostToolBridge(tools, {
      hostForSandbox: '127.0.0.1',
      bindAddress: '127.0.0.1',
      ...core,
    })
    try {
      const port = Number(new URL(bridge.url).port)
      const listener = await ngrok.forward({
        addr: port,
        authtoken_from_env: true,
      })
      const publicUrl = listener.url()
      if (!publicUrl) {
        throw new Error('ngrok did not return a public URL')
      }
      return {
        ...bridge,
        url: `${publicUrl}/mcp`,
        close: async () => {
          try {
            await listener.close()
          } finally {
            await bridge.close()
          }
        },
      }
    } catch (error) {
      // Don't leak the loopback bridge if the tunnel couldn't be opened.
      await bridge.close()
      throw error
    }
  },
}

/**
 * Chat middleware that routes the tool bridge through ngrok. Add it AFTER
 * `withSandbox(...)` for cloud providers so the in-sandbox harness can reach the
 * host tools. Not needed for local-process / Docker (they reach the bridge
 * directly) — just don't add it there.
 */
export const withNgrokBridge = defineChatMiddleware({
  name: 'ngrok-bridge',
  setup(ctx) {
    provideToolBridgeProvisioner(ctx, ngrokBridgeProvisioner)
  },
})
