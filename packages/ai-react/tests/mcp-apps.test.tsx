// @vitest-environment jsdom
import type { UIResourcePart } from '@tanstack/ai'
import type { McpAppBridge } from '@tanstack/ai-client'
import type { AppRendererProps } from '@mcp-ui/client'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPAppResource } from '../src/mcp-apps'

// The handler return type, derived from AppRenderer's own prop type so the
// test depends on `@mcp-ui/client` only (not the MCP SDK directly).
type CallToolResult = Awaited<
  ReturnType<NonNullable<AppRendererProps['onCallTool']>>
>

// Capture the props AppRenderer was called with. The component renders
// AppRenderer with AppRendererProps, so the mock receives that exact shape.
let capturedProps: Partial<AppRendererProps> = {}

vi.mock('@mcp-ui/client', () => ({
  AppRenderer: (props: Partial<AppRendererProps>) => {
    capturedProps = props
    return null
  },
}))

const fakePart: UIResourcePart = {
  type: 'ui-resource',
  resource: {
    uri: 'ui://test-server/my-tool',
    mimeType: 'text/html',
    text: '<html><body>hello</body></html>',
  },
  serverId: 'test-server',
  toolCallId: 'tc-1',
  toolName: 'show',
}

const fakeSandbox = { url: new URL('https://sandbox.example.com') }

function makeBridge(overrides?: Partial<McpAppBridge>): McpAppBridge {
  return {
    callTool: vi.fn().mockResolvedValue({ price: 1999 }),
    sendPrompt: vi.fn().mockResolvedValue(undefined),
    openLink: vi.fn().mockReturnValue({ isError: false }),
    ...overrides,
  }
}

/** Render the component and return the props captured from AppRenderer. The
 *  required handlers are read off the captured props with their real types. */
function renderAndCapture(props: {
  bridge?: McpAppBridge
  toolInput?: Record<string, unknown>
}) {
  capturedProps = {}
  render(
    <MCPAppResource
      part={fakePart}
      bridge={props.bridge}
      sandbox={fakeSandbox}
      toolInput={props.toolInput}
    />,
  )
  return capturedProps
}

/** The text of the first content block, asserting it is a text block. */
function firstText(result: CallToolResult): string {
  const block = result.content[0]
  expect(block?.type).toBe('text')
  if (block?.type !== 'text') throw new Error('expected a text content block')
  return block.text
}

describe('MCPAppResource', () => {
  beforeEach(() => {
    capturedProps = {}
  })

  it('renders AppRenderer with the correct static props', () => {
    const props = renderAndCapture({ bridge: makeBridge() })

    // toolName is sourced from the part, not a separate prop
    expect(props.toolName).toBe(fakePart.toolName)
    expect(props.sandbox).toBe(fakeSandbox)
    expect(props.html).toBe(fakePart.resource.text)
    expect(props.toolResourceUri).toBe(fakePart.resource.uri)
    expect(props.toolInput).toBeUndefined()
  })

  it('passes toolInput when provided', () => {
    const props = renderAndCapture({
      bridge: makeBridge(),
      toolInput: { qty: 3 },
    })

    expect(props.toolInput).toEqual({ qty: 3 })
  })

  it('onCallTool calls bridge.callTool and wraps result in CallToolResult shape', async () => {
    const bridge = makeBridge()
    const { onCallTool } = renderAndCapture({ bridge })

    const result = await onCallTool!({ name: 't', arguments: { a: 1 } }, extra())

    expect(bridge.callTool).toHaveBeenCalledWith({
      serverId: fakePart.serverId,
      toolName: 't',
      args: { a: 1 },
    })

    expect(result.content).toHaveLength(1)
    expect(firstText(result)).toBe(JSON.stringify({ price: 1999 }))
    expect(result.structuredContent).toEqual({ price: 1999 })
  })

  it('onCallTool wraps a string result as-is in the text field', async () => {
    const bridge = makeBridge({ callTool: vi.fn().mockResolvedValue('ok') })
    const { onCallTool } = renderAndCapture({ bridge })

    const result = await onCallTool!({ name: 't', arguments: {} }, extra())
    expect(firstText(result)).toBe('ok')
    expect(result.structuredContent).toBeUndefined()
  })

  it('onCallTool coalesces an undefined-serializing result to the string "null"', async () => {
    const bridge = makeBridge({
      callTool: vi.fn().mockResolvedValue(undefined),
    })
    const { onCallTool } = renderAndCapture({ bridge })

    const result = await onCallTool!({ name: 't', arguments: {} }, extra())
    // JSON.stringify(undefined) is the value undefined; the coalesce keeps text a string
    expect(firstText(result)).toBe('null')
  })

  it('onMessage extracts text content and calls bridge.sendPrompt', async () => {
    const bridge = makeBridge()
    const { onMessage } = renderAndCapture({ bridge })

    const result = await onMessage!(
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      extra(),
    )

    expect(bridge.sendPrompt).toHaveBeenCalledWith('hi')
    expect(result).toEqual({})
  })

  it('onMessage concatenates multiple text content blocks', async () => {
    const bridge = makeBridge()
    const { onMessage } = renderAndCapture({ bridge })

    await onMessage!(
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image', data: '', mimeType: 'image/png' },
          { type: 'text', text: ' world' },
        ],
      },
      extra(),
    )

    expect(bridge.sendPrompt).toHaveBeenCalledWith('hello world')
  })

  it('onMessage does not call bridge.sendPrompt when there is no text content', async () => {
    const bridge = makeBridge()
    const { onMessage } = renderAndCapture({ bridge })

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

  it('onOpenLink calls bridge.openLink with the URL string', async () => {
    const bridge = makeBridge()
    const { onOpenLink } = renderAndCapture({ bridge })

    const result = await onOpenLink!({ url: 'https://example.com' }, extra())

    expect(bridge.openLink).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ isError: false })
  })

  it('display-only mode (no bridge) passes undefined callbacks', () => {
    const props = renderAndCapture({})

    expect(props.toolName).toBe(fakePart.toolName)
    expect(props.onCallTool).toBeUndefined()
    expect(props.onMessage).toBeUndefined()
    expect(props.onOpenLink).toBeUndefined()
  })
})

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
