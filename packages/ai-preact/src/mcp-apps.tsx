import { AppRenderer } from '@mcp-ui/client'
import type { AppRendererProps } from '@mcp-ui/client'
import type { UIResourcePart } from '@tanstack/ai'
import type { McpAppBridge } from '@tanstack/ai-client'

export interface MCPAppResourceProps {
  /** The ui-resource part from a UIMessage assistant part. */
  part: UIResourcePart
  bridge?: McpAppBridge
  /** Sandbox iframe configuration — must include the proxy page URL. */
  sandbox: { url: URL }
  /** Optional structured arguments forwarded to the guest UI once it's ready. */
  toolInput?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resultToText(result: unknown): string {
  if (typeof result === 'string') return result
  // `JSON.stringify`'s lib signature claims `string`, but it returns
  // `undefined` for `undefined`/function inputs; type the call honestly.
  const stringify: (value: unknown) => string | undefined = JSON.stringify
  return stringify(result) ?? 'null'
}

export function MCPAppResource(props: MCPAppResourceProps) {
  const { part, bridge, sandbox, toolInput } = props

  const onCallTool: AppRendererProps['onCallTool'] = bridge
    ? async (params) => {
        const result = await bridge.callTool({
          serverId: part.serverId,
          toolName: params.name,
          args: params.arguments,
        })

        return {
          content: [
            {
              type: 'text' as const,
              text: resultToText(result),
            },
          ],
          structuredContent: isRecord(result) ? result : undefined,
        }
      }
    : undefined

  const onMessage: AppRendererProps['onMessage'] = bridge
    ? async (params) => {
        const text = params.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('')
        if (text) await bridge.sendPrompt(text)
        return {}
      }
    : undefined

  const onOpenLink: AppRendererProps['onOpenLink'] = bridge
    ? (params) => Promise.resolve(bridge.openLink(params.url))
    : undefined

  return (
    <AppRenderer
      toolName={part.toolName}
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
