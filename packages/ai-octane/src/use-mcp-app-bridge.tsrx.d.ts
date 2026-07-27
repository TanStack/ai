// Declaration companion generated from use-mcp-app-bridge.tsrx.
import type { CreateMcpAppBridgeOptions, McpAppBridge } from '@tanstack/ai-client';
export type UseMcpAppBridgeOptions = CreateMcpAppBridgeOptions;
/**
 * Octane wrapper around `createMcpAppBridge` that returns a **stable** bridge for
 * the given `threadId`/`callEndpoint`, while always invoking the latest
 * `chat.sendMessage` and `onLink` (kept in refs). This avoids both recreating
 * the bridge on every render and the stale-closure / `exhaustive-deps` dance
 * you'd otherwise write by hand:
 *
 * ```tsx
 * const { sendMessage } = useChat({ threadId, connection })
 * const bridge = useMcpAppBridge({
 *   threadId,
 *   callEndpoint: '/api/mcp-apps-call',
 *   chat: { sendMessage: async (content) => void sendMessage(content) },
 *   onLink: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
 * })
 * // pass `bridge` to <MCPAppResource bridge={bridge} … />
 * ```
 *
 * The bridge is recreated only when `threadId`, `callEndpoint`, `fetchImpl`, or
 * the *presence* of `onLink` changes — passing a new inline `onLink`/`sendMessage`
 * each render does not churn it.
 */
export declare function useMcpAppBridge(options: UseMcpAppBridgeOptions): McpAppBridge;
