/**
 * MCPAppResource — Preact wrapper for rendering MCP App UI resources.
 *
 * PREACT/COMPAT NOTE:
 * `@mcp-ui/client@7.1.1` is published React-only: `AppRenderer` is a React
 * `forwardRef` component. There is NO dedicated preact entry point and NO web
 * component variant. This wrapper imports `{ AppRenderer }` from
 * `'@mcp-ui/client'` identically to the React wrapper and relies on the
 * *consumer's* `preact/compat` alias (resolving `react` / `react-dom` to
 * `preact/compat`) to render the React component under Preact.
 * Wiring up that alias is the consumer's responsibility and is NOT
 * runtime-verified in this repository.
 */
import type { UIResourcePart } from '@tanstack/ai'
import type { McpAppBridge } from '@tanstack/ai-client'
import type { AppRendererProps } from '@mcp-ui/client'
import { AppRenderer } from '@mcp-ui/client'

export interface MCPAppResourceProps {
  /** The ui-resource part from a UIMessage assistant part. */
  part: UIResourcePart
  /** Framework-agnostic bridge for tool calls, prompt sending, and link opening. */
  bridge: McpAppBridge
  /** Sandbox iframe configuration — must include the proxy page URL. */
  sandbox: { url: URL }
  /** The MCP tool name whose UI is being rendered. */
  toolName: string
  /** Optional structured arguments forwarded to the guest UI once it's ready. */
  toolInput?: Record<string, unknown>
}

/**
 * Renders an MCP App UI resource inside a sandboxed iframe.
 *
 * Wraps `@mcp-ui/client`'s `AppRenderer` and wires its callbacks to a
 * framework-agnostic {@link McpAppBridge}.
 */
export function MCPAppResource(props: MCPAppResourceProps) {
  const { part, bridge, sandbox, toolName, toolInput } = props

  const onCallTool: AppRendererProps['onCallTool'] = async (params) => {
    const result = await bridge.callTool({
      serverId: part.serverId,
      toolName: params.name,
      args: params.arguments,
    })

    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result),
        },
      ],
      structuredContent: result,
    }
  }

  const onMessage: AppRendererProps['onMessage'] = async (params) => {
    const text = params.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .join('')
    await bridge.sendPrompt(text)
    return {}
  }

  const onOpenLink: AppRendererProps['onOpenLink'] = async (params) =>
    bridge.openLink(params.url)

  return (
    <AppRenderer
      toolName={toolName}
      sandbox={sandbox}
      html={part.resource.text}
      toolResourceUri={part.resource.uri}
      toolInput={toolInput}
      onCallTool={onCallTool}
      onMessage={onMessage}
      onOpenLink={onOpenLink}
    />
  )
}
