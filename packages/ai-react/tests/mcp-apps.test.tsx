// @vitest-environment jsdom
import type { UIResourcePart } from '@tanstack/ai'
import type { McpAppBridge } from '@tanstack/ai-client'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPAppResource } from '../src/mcp-apps'

// Capture the last props AppRenderer was called with
let capturedProps: Record<string, unknown> = {}

vi.mock('@mcp-ui/client', () => ({
  AppRenderer: (props: Record<string, unknown>) => {
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
}

const fakeSandbox = { url: new URL('https://sandbox.example.com') }

function makeBridge(): McpAppBridge {
  return {
    callTool: vi.fn().mockResolvedValue({ price: 1999 }),
    sendPrompt: vi.fn().mockResolvedValue(undefined),
    openLink: vi.fn().mockReturnValue({ isError: false }),
  }
}

describe('MCPAppResource', () => {
  beforeEach(() => {
    capturedProps = {}
  })

  it('renders AppRenderer with the correct static props', () => {
    const bridge = makeBridge()
    render(
      <MCPAppResource
        part={fakePart}
        bridge={bridge}
        sandbox={fakeSandbox}
        toolName="show"
      />,
    )

    expect(capturedProps['toolName']).toBe('show')
    expect(capturedProps['sandbox']).toBe(fakeSandbox)
    expect(capturedProps['html']).toBe(fakePart.resource.text)
    expect(capturedProps['toolResourceUri']).toBe(fakePart.resource.uri)
    expect(capturedProps['toolInput']).toBeUndefined()
  })

  it('passes toolInput when provided', () => {
    const bridge = makeBridge()
    render(
      <MCPAppResource
        part={fakePart}
        bridge={bridge}
        sandbox={fakeSandbox}
        toolName="show"
        toolInput={{ qty: 3 }}
      />,
    )

    expect(capturedProps['toolInput']).toEqual({ qty: 3 })
  })

  it('onCallTool calls bridge.callTool and wraps result in CallToolResult shape', async () => {
    const bridge = makeBridge()
    render(
      <MCPAppResource
        part={fakePart}
        bridge={bridge}
        sandbox={fakeSandbox}
        toolName="show"
      />,
    )

    const onCallTool = capturedProps['onCallTool'] as (params: {
      name: string
      arguments?: Record<string, unknown>
    }) => Promise<{ content: Array<{ type: string; text: string }>; structuredContent: unknown }>

    const result = await onCallTool({ name: 't', arguments: { a: 1 } })

    expect(bridge.callTool).toHaveBeenCalledWith({
      serverId: fakePart.serverId,
      toolName: 't',
      args: { a: 1 },
    })

    expect(result.content).toHaveLength(1)
    expect(result.content[0]!.type).toBe('text')
    expect(result.content[0]!.text).toBe(JSON.stringify({ price: 1999 }))
    expect(result.structuredContent).toEqual({ price: 1999 })
  })

  it('onCallTool wraps a string result as-is in the text field', async () => {
    const bridge: McpAppBridge = {
      callTool: vi.fn().mockResolvedValue('ok'),
      sendPrompt: vi.fn(),
      openLink: vi.fn().mockReturnValue({ isError: false }),
    }
    render(
      <MCPAppResource
        part={fakePart}
        bridge={bridge}
        sandbox={fakeSandbox}
        toolName="show"
      />,
    )

    const onCallTool = capturedProps['onCallTool'] as (params: {
      name: string
      arguments?: Record<string, unknown>
    }) => Promise<{ content: Array<{ type: string; text: string }> }>

    const result = await onCallTool({ name: 't', arguments: {} })
    expect(result.content[0]!.text).toBe('ok')
  })

  it('onMessage extracts text content and calls bridge.sendPrompt', async () => {
    const bridge = makeBridge()
    render(
      <MCPAppResource
        part={fakePart}
        bridge={bridge}
        sandbox={fakeSandbox}
        toolName="show"
      />,
    )

    const onMessage = capturedProps['onMessage'] as (params: {
      role: 'user'
      content: Array<{ type: string; text?: string }>
    }) => Promise<Record<string, unknown>>

    const result = await onMessage({
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    })

    expect(bridge.sendPrompt).toHaveBeenCalledWith('hi')
    expect(result).toEqual({})
  })

  it('onMessage concatenates multiple text content blocks', async () => {
    const bridge = makeBridge()
    render(
      <MCPAppResource
        part={fakePart}
        bridge={bridge}
        sandbox={fakeSandbox}
        toolName="show"
      />,
    )

    const onMessage = capturedProps['onMessage'] as (params: {
      role: 'user'
      content: Array<{ type: string; text?: string }>
    }) => Promise<Record<string, unknown>>

    await onMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'hello' },
        { type: 'image', text: undefined },
        { type: 'text', text: ' world' },
      ],
    })

    expect(bridge.sendPrompt).toHaveBeenCalledWith('hello world')
  })

  it('onOpenLink calls bridge.openLink with the URL string', async () => {
    const bridge = makeBridge()
    render(
      <MCPAppResource
        part={fakePart}
        bridge={bridge}
        sandbox={fakeSandbox}
        toolName="show"
      />,
    )

    const onOpenLink = capturedProps['onOpenLink'] as (params: {
      url: string
    }) => Promise<{ isError: boolean }>

    const result = await onOpenLink({ url: 'https://example.com' })

    expect(bridge.openLink).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ isError: false })
  })
})
