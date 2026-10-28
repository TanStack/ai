import { createMcpAppBridge as createClientMcpAppBridge } from '@tanstack/ai-client'
import type { CreateMcpAppBridgeOptions } from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'

export type { CreateMcpAppBridgeOptions }

/**
 * Remix setup wrapper around the client `createMcpAppBridge`.
 *
 * Call once in component setup with the Remix `Handle`. Setup does not re-run,
 * so the bridge is created once from `options`. The client bridge has no
 * dispose, so `handle.signal` is unused.
 *
 * @param handle Remix component handle from setup.
 * @param options Same options as the client factory (`threadId`, `callEndpoint`,
 *   `chat.sendMessage`, optional `fetchImpl` / `onLink`).
 *
 * @example
 * ```tsx
 * function Widget(handle: Handle) {
 *   const bridge = createMcpAppBridge(handle, {
 *     threadId: 't1',
 *     callEndpoint: '/api/mcp-apps-call',
 *     chat: { sendMessage },
 *     onLink: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
 *   })
 *   return () => <MCPAppResource bridge={bridge} />
 * }
 * ```
 */
export function createMcpAppBridge(
  handle: Handle,
  options: CreateMcpAppBridgeOptions,
) {
  return createClientMcpAppBridge(options)
}
