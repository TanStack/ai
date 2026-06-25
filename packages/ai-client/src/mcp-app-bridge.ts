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
  onNotify?: (payload: unknown) => void
  onIntent?: (intent: string, payload: unknown) => void
}

export interface McpAppBridge {
  callTool: (input: {
    serverId?: string
    toolName: string
    args?: Record<string, unknown>
    messageId?: string
  }) => Promise<unknown>
  sendPrompt: (text: string) => Promise<void>
  openLink: (url: string) => { isError: boolean }
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

      const data = (await response.json()) as {
        ok: boolean
        result?: unknown
        error?: string
      }

      if (!data.ok) {
        throw new Error(data.error ?? 'MCP app tool call failed')
      }

      return data.result
    },

    async sendPrompt(text) {
      await chat.sendMessage(text)
    },

    openLink(url) {
      if (onLink) {
        onLink(url)
        return { isError: false }
      }
      return { isError: true }
    },
  }
}
