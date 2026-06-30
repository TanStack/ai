import { AppRenderer } from '@mcp-ui/client'
import type { UIResourcePart } from '@tanstack/ai'
import type { McpAppBridge } from '@tanstack/ai-client'
import type { JSX } from 'react'

export interface MCPAppResourceProps {
  /** The ui-resource part from a UIMessage assistant part. */
  part: UIResourcePart
  /**
   * Framework-agnostic bridge for tool calls, prompt sending, and link opening.
   * Omit it to render the widget in display-only mode — iframe interactions
   * that would trigger tool calls or prompts are ignored.
   */
  bridge?: McpAppBridge
  /** Sandbox iframe configuration — must include the proxy page URL. */
  sandbox: { url: URL }
  /** Optional structured arguments forwarded to the guest UI once it's ready. */
  toolInput?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Coalesce an arbitrary bridge result into the `string` required by the
 * `CallToolResult` text content block. `JSON.stringify` is typed to return
 * `string` but actually returns `undefined` for inputs like `undefined` or a
 * function, so we narrow explicitly to avoid `text: undefined`.
 */
function resultToText(result: unknown): string {
  if (typeof result === 'string') return result
  // `JSON.stringify`'s lib signature claims `string`, but it returns
  // `undefined` for `undefined`/function inputs; type the call honestly.
  const stringify: (value: unknown) => string | undefined = JSON.stringify
  return stringify(result) ?? 'null'
}

export function MCPAppResource(props: MCPAppResourceProps): JSX.Element {
  const { bridge } = props
  return (
    <AppRenderer
      toolName={props.part.toolName}
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
                    text: resultToText(result),
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
                .filter(
                  (c): c is { type: 'text'; text: string } => c.type === 'text',
                )
                .map((c) => c.text)
                .join('')
              if (text) await bridge.sendPrompt(text)
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
