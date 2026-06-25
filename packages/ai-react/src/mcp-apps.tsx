import { AppRenderer } from '@mcp-ui/client'
import type { UIResourcePart } from '@tanstack/ai'
import type { McpAppBridge } from '@tanstack/ai-client'
import type { JSX } from 'react'

export interface MCPAppResourceProps {
  part: UIResourcePart
  /**
   * Framework-agnostic bridge for tool calls, prompt sending, and link opening.
   * Omit it to render the widget in display-only mode — iframe interactions
   * that would trigger tool calls or prompts are ignored.
   */
  bridge?: McpAppBridge
  sandbox: { url: URL }
  toolName: string
  toolInput?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function MCPAppResource(props: MCPAppResourceProps): JSX.Element {
  const { bridge } = props
  return (
    <AppRenderer
      toolName={props.toolName}
      sandbox={props.sandbox}
      html={props.part.resource.text}
      toolResourceUri={props.part.resource.uri}
      toolInput={props.toolInput}
      onCallTool={
        bridge
          ? async ({ name, arguments: args }) => {
              const result = await bridge.callTool({
                serverId: props.part.serverId,
                toolName: name,
                args,
              })
              const structuredContent = isRecord(result) ? result : undefined
              return {
                content: [
                  {
                    type: 'text' as const,
                    text:
                      typeof result === 'string'
                        ? result
                        : JSON.stringify(result),
                  },
                ],
                structuredContent,
              }
            }
          : undefined
      }
      onMessage={
        bridge
          ? async ({ content }) => {
              const text = content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('')
              await bridge.sendPrompt(text)
              return {}
            }
          : undefined
      }
      onOpenLink={
        bridge ? ({ url }) => Promise.resolve(bridge.openLink(url)) : undefined
      }
    />
  )
}
