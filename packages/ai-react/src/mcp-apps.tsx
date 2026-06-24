import type { UIResourcePart } from '@tanstack/ai'
import type { McpAppBridge } from '@tanstack/ai-client'
import { AppRenderer } from '@mcp-ui/client'
import type { JSX } from 'react'

export interface MCPAppResourceProps {
  part: UIResourcePart
  bridge: McpAppBridge
  sandbox: { url: URL }
  toolName: string
  toolInput?: Record<string, unknown>
}

export function MCPAppResource(props: MCPAppResourceProps): JSX.Element {
  return (
    <AppRenderer
      toolName={props.toolName}
      sandbox={props.sandbox}
      html={props.part.resource.text}
      toolResourceUri={props.part.resource.uri}
      toolInput={props.toolInput}
      onCallTool={async ({ name, arguments: args }) => {
        const result = await props.bridge.callTool({
          serverId: props.part.serverId,
          toolName: name,
          args,
        })
        return {
          content: [
            {
              type: 'text' as const,
              text:
                typeof result === 'string' ? result : JSON.stringify(result),
            },
          ],
          structuredContent: result,
        }
      }}
      onMessage={async ({ content }) => {
        const text = content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('')
        await props.bridge.sendPrompt(text)
        return {}
      }}
      onOpenLink={async ({ url }) => props.bridge.openLink(url)}
    />
  )
}
