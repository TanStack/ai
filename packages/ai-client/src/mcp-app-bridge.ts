export interface CreateMcpAppBridgeOptions {
  threadId: string
  callEndpoint: string
  chat: {
    sendMessage: (
      content: string,
      body?: Record<string, unknown>,
    ) => Promise<void>
  }
  fetchImpl?: typeof fetch
  onLink?: (url: string) => void
}

export interface McpAppBridge {
  callTool: (input: {
    serverId?: string
    toolName: string
    args?: Record<string, unknown>
    /**
     * Reserved — forwarded to the call handler for correlation purposes but
     * not consumed by the handler. Accepted on the wire; the handler does not
     * read it (mirrors the `meta` convention on `UIResourcePart`).
     */
    messageId?: string
  }) => Promise<unknown>
  sendPrompt: (text: string) => Promise<void>
  openLink: (url: string) => { isError: boolean }
}

interface ToolCallResponse {
  ok: boolean
  result?: unknown
  error?: string
}

function isToolCallResponse(value: unknown): value is ToolCallResponse {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record['ok'] === 'boolean'
}

export function createMcpAppBridge(
  options: CreateMcpAppBridgeOptions,
): McpAppBridge {
  const { threadId, callEndpoint, chat, fetchImpl, onLink } = options
  const doFetch = fetchImpl ?? fetch

  return {
    async callTool(input) {
      const response = await doFetch(callEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId,
          serverId: input.serverId,
          toolName: input.toolName,
          args: input.args,
          messageId: input.messageId,
        }),
      })

      if (!response.ok) {
        throw new Error(`MCP app tool call failed: HTTP ${response.status}`)
      }

      const raw: unknown = await response.json()
      if (!isToolCallResponse(raw)) {
        throw new Error('MCP app tool call failed')
      }

      if (!raw.ok) {
        throw new Error(raw.error ?? 'MCP app tool call failed')
      }

      return raw.result
    },

    async sendPrompt(text) {
      await chat.sendMessage(text)
    },

    openLink(url) {
      if (onLink) {
        try {
          onLink(url)
          return { isError: false }
        } catch (err) {
          console.warn('[mcp-app-bridge] openLink: onLink handler threw', err)
          return { isError: true }
        }
      }
      console.warn('[mcp-app-bridge] openLink ignored: no onLink handler configured')
      return { isError: true }
    },
  }
}
