import { useMemo, useRef } from 'preact/hooks'
import { createMcpAppBridge } from '@tanstack/ai-client'
import type {
  CreateMcpAppBridgeOptions,
  McpAppBridge,
} from '@tanstack/ai-client'

export type UseMcpAppBridgeOptions = CreateMcpAppBridgeOptions

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
