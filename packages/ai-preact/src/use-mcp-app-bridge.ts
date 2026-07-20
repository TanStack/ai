import { useMemo, useRef } from 'preact/hooks'
import { createMcpAppBridge } from '@tanstack/ai-client'
import type {
  CreateMcpAppBridgeOptions,
  McpAppBridge,
} from '@tanstack/ai-client'

export type UseMcpAppBridgeOptions = CreateMcpAppBridgeOptions

/**
 * Preact wrapper around `createMcpAppBridge` that returns a **stable** bridge for
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
export function useMcpAppBridge(options: UseMcpAppBridgeOptions): McpAppBridge {
  const { threadId, callEndpoint, chat, fetchImpl, onLink } = options

  // Latest-value refs so the bridge identity stays stable but its callbacks are
  // never stale (the bridge calls `.current` at invocation time, not creation).
  const chatRef = useRef(chat)
  chatRef.current = chat
  const onLinkRef = useRef(onLink)
  onLinkRef.current = onLink

  // Whether a link handler was supplied governs the bridge's link behavior
  // (forward vs. display-only warn), so it's part of the bridge's identity.
  const hasOnLink = onLink != null

  return useMemo(
    () =>
      createMcpAppBridge({
        threadId,
        callEndpoint,
        fetchImpl,
        chat: {
          sendMessage: (content, body) =>
            chatRef.current.sendMessage(content, body),
        },
        onLink: hasOnLink ? (url) => onLinkRef.current?.(url) : undefined,
      }),
    [threadId, callEndpoint, fetchImpl, hasOnLink],
  )
}
