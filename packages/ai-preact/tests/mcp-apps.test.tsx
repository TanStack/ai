// @vitest-environment jsdom
import { render } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
import type { McpAppBridge } from '@tanstack/ai-client'
import type { UIResourcePart } from '@tanstack/ai'
import type { AppRendererProps } from '@mcp-ui/client'

// Mock @mcp-ui/client so we can capture props without a real React/iframe setup.
// The real AppRenderer is a React forwardRef component; under preact/compat it
// renders fine, but in tests we only want to inspect the wired callbacks.
let capturedProps: Partial<AppRendererProps> = {}

vi.mock('@mcp-ui/client', () => ({
  AppRenderer: (props: Partial<AppRendererProps>) => {
    capturedProps = props
    return null
  },
}))

// Import AFTER mock is registered.
import { MCPAppResource } from '../src/mcp-apps'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// The handler return type, derived from AppRenderer's own prop type so the
// test depends on `@mcp-ui/client` only (not the MCP SDK directly).
type CallToolResult = Awaited<
  ReturnType<NonNullable<AppRendererProps['onCallTool']>>
>

const part: UIResourcePart = {
  type: 'ui-resource',
  resource: {
    uri: 'ui://my-server/my-tool',
    mimeType: 'text/html',
    text: '<html><body>hello</body></html>',
  },
  serverId: 'server-42',
  toolCallId: 'tc-1',
  toolName: 'my-tool',
}

const bridge: McpAppBridge = {
  callTool: vi.fn().mockResolvedValue({ price: 1999 }),
  sendPrompt: vi.fn().mockResolvedValue(undefined),
  openLink: vi.fn().mockReturnValue({ isError: false }),
}

const sandbox = { url: new URL('https://sandbox.example.com/proxy.html') }

function renderComponent() {
  capturedProps = {}
  render(
    <MCPAppResource
      part={part}
      bridge={bridge}
      sandbox={sandbox}
      toolInput={{ param: 'value' }}
    />,
  )
  return capturedProps
}

/** The `extra` argument the AppRenderer handlers receive. The handlers under
 *  test ignore it; this builds the required fields so no cast is needed. */
function extra(): Parameters<NonNullable<AppRendererProps['onCallTool']>>[1] {
  return {
    signal: new AbortController().signal,
    requestId: 1,
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error('not implemented in test')
    },
  }
}

/** The first content block, asserting it is a text block. */
function firstTextBlock(result: CallToolResult) {
  const block = result.content[0]
  expect(block?.type).toBe('text')
  if (block?.type !== 'text') throw new Error('expected a text content block')
  return block
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPAppResource', () => {
  it('passes required props to AppRenderer', () => {
    const props = renderComponent()

    // toolName is sourced from the part, not a separate prop
    expect(props.toolName).toBe(part.toolName)
    expect(props.sandbox).toBe(sandbox)
    expect(props.html).toBe(part.resource.text)
    expect(props.toolResourceUri).toBe(part.resource.uri)
    expect(props.toolInput).toEqual({ param: 'value' })
  })

  it('onCallTool calls bridge.callTool and returns CallToolResult shape', async () => {
    const { onCallTool } = renderComponent()

    const result = await onCallTool!({ name: 't', arguments: { a: 1 } }, extra())

    expect(bridge.callTool).toHaveBeenCalledWith({
      serverId: part.serverId,
      toolName: 't',
      args: { a: 1 },
    })

    // structuredContent is the raw bridge result
    expect(result.structuredContent).toEqual({ price: 1999 })

    // content wraps stringified result
    expect(result.content).toHaveLength(1)
    expect(firstTextBlock(result)).toEqual({
      type: 'text',
      text: JSON.stringify({ price: 1999 }),
    })
  })

  it('onCallTool wraps a string bridge result as-is in the text block', async () => {
    vi.mocked(bridge.callTool).mockResolvedValueOnce('direct string')
    const { onCallTool } = renderComponent()

    const result = await onCallTool!({ name: 'echo', arguments: {} }, extra())

    expect(firstTextBlock(result)).toEqual({ type: 'text', text: 'direct string' })
    // A non-object bridge result cannot satisfy CallToolResult's
    // structuredContent ({ [x: string]: unknown }), so it is omitted; the raw
    // string is still surfaced verbatim in the text content block above.
    expect(result.structuredContent).toBeUndefined()
  })

  it('onCallTool coalesces an undefined-serializing result to the string "null"', async () => {
    vi.mocked(bridge.callTool).mockResolvedValueOnce(undefined)
    const { onCallTool } = renderComponent()

    const result = await onCallTool!({ name: 'noop', arguments: {} }, extra())

    // JSON.stringify(undefined) is the value undefined; the coalesce keeps text a string
    expect(firstTextBlock(result)).toEqual({ type: 'text', text: 'null' })
  })

  it('onMessage calls bridge.sendPrompt with joined text blocks and returns {}', async () => {
    const { onMessage } = renderComponent()

    const result = await onMessage!(
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image', data: '', mimeType: 'image/png' }, // non-text — filtered out
          { type: 'text', text: ' there' },
        ],
      },
      extra(),
    )

    expect(bridge.sendPrompt).toHaveBeenCalledWith('hi there')
    expect(result).toEqual({})
  })

  it('onMessage does not call bridge.sendPrompt when there is no text content', async () => {
    vi.mocked(bridge.sendPrompt).mockClear()
    const { onMessage } = renderComponent()

    const result = await onMessage!(
      {
        role: 'user',
        content: [{ type: 'image', data: '', mimeType: 'image/png' }],
      },
      extra(),
    )

    expect(bridge.sendPrompt).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it('onOpenLink calls bridge.openLink and returns its result', async () => {
    const { onOpenLink } = renderComponent()

    const result = await onOpenLink!({ url: 'https://example.com' }, extra())

    expect(bridge.openLink).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ isError: false })
  })

  it('display-only mode (no bridge) passes undefined callbacks', () => {
    capturedProps = {}
    render(<MCPAppResource part={part} sandbox={sandbox} />)

    expect(capturedProps.toolName).toBe(part.toolName)
    expect(capturedProps.onCallTool).toBeUndefined()
    expect(capturedProps.onMessage).toBeUndefined()
    expect(capturedProps.onOpenLink).toBeUndefined()
  })
})
