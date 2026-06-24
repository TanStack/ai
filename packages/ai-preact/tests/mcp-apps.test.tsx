// @vitest-environment jsdom
import { render } from '@testing-library/preact'
import { describe, expect, it, vi } from 'vitest'
import type { McpAppBridge } from '@tanstack/ai-client'
import type { UIResourcePart } from '@tanstack/ai'

// Mock @mcp-ui/client so we can capture props without a real React/iframe setup.
// The real AppRenderer is a React forwardRef component; under preact/compat it
// renders fine, but in tests we only want to inspect the wired callbacks.
let capturedProps: Record<string, unknown> = {}

vi.mock('@mcp-ui/client', () => ({
  AppRenderer: (props: Record<string, unknown>) => {
    capturedProps = props
    return null
  },
}))

// Import AFTER mock is registered.
import { MCPAppResource } from '../src/mcp-apps'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const part: UIResourcePart = {
  type: 'ui-resource',
  resource: {
    uri: 'ui://my-server/my-tool',
    mimeType: 'text/html',
    text: '<html><body>hello</body></html>',
  },
  serverId: 'server-42',
  toolCallId: 'tc-1',
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
      toolName="my-tool"
      toolInput={{ param: 'value' }}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCPAppResource', () => {
  it('passes required props to AppRenderer', () => {
    renderComponent()

    expect(capturedProps['toolName']).toBe('my-tool')
    expect(capturedProps['sandbox']).toBe(sandbox)
    expect(capturedProps['html']).toBe(part.resource.text)
    expect(capturedProps['toolResourceUri']).toBe(part.resource.uri)
    expect(capturedProps['toolInput']).toEqual({ param: 'value' })
  })

  it('onCallTool calls bridge.callTool and returns CallToolResult shape', async () => {
    renderComponent()

    const onCallTool = capturedProps['onCallTool'] as (params: {
      name: string
      arguments?: Record<string, unknown>
    }) => Promise<{ content: Array<{ type: string; text: string }>; structuredContent: unknown }>

    const result = await onCallTool({ name: 't', arguments: { a: 1 } })

    expect(bridge.callTool).toHaveBeenCalledWith({
      serverId: part.serverId,
      toolName: 't',
      args: { a: 1 },
    })

    // structuredContent is the raw bridge result
    expect(result.structuredContent).toEqual({ price: 1999 })

    // content wraps stringified result
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify({ price: 1999 }),
    })
  })

  it('onCallTool wraps a string bridge result as-is in the text block', async () => {
    vi.mocked(bridge.callTool).mockResolvedValueOnce('direct string')
    renderComponent()

    const onCallTool = capturedProps['onCallTool'] as (params: {
      name: string
      arguments?: Record<string, unknown>
    }) => Promise<{ content: Array<{ type: string; text: string }>; structuredContent: unknown }>

    const result = await onCallTool({ name: 'echo', arguments: {} })

    expect(result.content[0]).toEqual({ type: 'text', text: 'direct string' })
    expect(result.structuredContent).toBe('direct string')
  })

  it('onMessage calls bridge.sendPrompt with joined text blocks and returns {}', async () => {
    renderComponent()

    const onMessage = capturedProps['onMessage'] as (params: {
      role: 'user'
      content: Array<{ type: string; text?: string }>
    }) => Promise<Record<string, unknown>>

    const result = await onMessage({
      role: 'user',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'image' }, // non-text — should be filtered out
        { type: 'text', text: ' there' },
      ],
    })

    expect(bridge.sendPrompt).toHaveBeenCalledWith('hi there')
    expect(result).toEqual({})
  })

  it('onOpenLink calls bridge.openLink and returns its result', async () => {
    renderComponent()

    const onOpenLink = capturedProps['onOpenLink'] as (params: {
      url: string
    }) => Promise<{ isError?: boolean }>

    const result = await onOpenLink({ url: 'https://example.com' })

    expect(bridge.openLink).toHaveBeenCalledWith('https://example.com')
    expect(result).toEqual({ isError: false })
  })
})
