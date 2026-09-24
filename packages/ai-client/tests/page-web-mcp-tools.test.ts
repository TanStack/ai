import { afterEach, describe, expect, it, vi } from 'vitest'
import { getWebMCPTools, subscribeWebMCPTools } from '../src/web-mcp-tools'
import type { WebMCPPageTool } from '../src/web-mcp-tools'

const weather: WebMCPPageTool = {
  name: 'get_weather',
  description: 'Get the weather',
  inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
  origin: 'https://example.com',
}
const other: WebMCPPageTool = {
  name: 'other_tool',
  description: 'A tool from another origin',
  origin: 'https://other.example',
}

function installModelContext(initialTools: Array<WebMCPPageTool>) {
  const target = new EventTarget()
  const modelContext = {
    tools: initialTools,
    getTools: vi.fn(async () => modelContext.tools),
    executeTool: vi.fn(
      async (
        _tool: WebMCPPageTool,
        _input: unknown,
        _options: { signal?: AbortSignal },
      ) => '{"temperature":21}',
    ),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    changeTools(tools: Array<WebMCPPageTool>) {
      modelContext.tools = tools
      target.dispatchEvent(new Event('toolchange'))
    },
  }
  vi.stubGlobal('document', { modelContext })
  return modelContext
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getWebMCPTools', () => {
  it('converts page tools to client tools that run through executeTool', async () => {
    const modelContext = installModelContext([weather])
    const controller = new AbortController()

    const [tool] = await getWebMCPTools()

    expect(tool).toMatchObject({
      __toolSide: 'client',
      name: 'get_weather',
      description: 'Get the weather',
      inputSchema: weather.inputSchema,
    })
    await expect(
      tool?.execute?.({ city: 'Sarajevo' }, { abortSignal: controller.signal }),
    ).resolves.toEqual({ temperature: 21 })
    expect(modelContext.executeTool).toHaveBeenCalledWith(
      weather,
      { city: 'Sarajevo' },
      { signal: controller.signal },
    )
  })

  it('returns a result that is not JSON as a string', async () => {
    const modelContext = installModelContext([other])
    modelContext.executeTool.mockResolvedValueOnce('plain text')

    const [tool] = await getWebMCPTools()

    expect(tool?.inputSchema).toEqual({ type: 'object' })
    await expect(tool?.execute?.({})).resolves.toBe('plain text')
  })

  it('skips tools that the filter rejects', async () => {
    installModelContext([weather, other])

    const tools = await getWebMCPTools({
      filter: (tool) => tool.origin === 'https://example.com',
    })

    expect(tools.map((tool) => tool.name)).toEqual(['get_weather'])
  })

  it('returns an empty array without WebMCP', async () => {
    vi.stubGlobal('document', {})
    await expect(getWebMCPTools()).resolves.toEqual([])

    vi.stubGlobal('document', undefined)
    await expect(getWebMCPTools()).resolves.toEqual([])
  })

  it('rejects duplicate names from different frames after filtering', async () => {
    const parentTool = { ...weather, window: {}, title: 'Parent weather' }
    const frameTool = { ...weather, window: {}, title: 'Frame weather' }
    const modelContext = installModelContext([parentTool, frameTool])

    await expect(getWebMCPTools()).rejects.toThrow(
      'Duplicate WebMCP tool name "get_weather"',
    )
    expect(modelContext.executeTool).not.toHaveBeenCalled()

    const tools = await getWebMCPTools({
      filter: (tool) => tool.title === 'Parent weather',
    })
    expect(tools).toHaveLength(1)
    await tools[0]?.execute?.({ city: 'Sarajevo' })
    expect(modelContext.executeTool).toHaveBeenCalledWith(
      parentTool,
      { city: 'Sarajevo' },
      {},
    )
  })

  it('rejects when getTools rejects', async () => {
    const modelContext = installModelContext([])
    modelContext.getTools.mockRejectedValueOnce(new Error('NotAllowedError'))

    await expect(getWebMCPTools()).rejects.toThrow('NotAllowedError')
  })
})

describe('subscribeWebMCPTools', () => {
  it('reports duplicate names without replacing the last good list and recovers', async () => {
    const modelContext = installModelContext([weather])
    const controller = new AbortController()
    const listener = vi.fn()
    const onError = vi.fn()
    subscribeWebMCPTools(listener, { signal: controller.signal, onError })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())

    modelContext.changeTools([weather, { ...weather }])
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Duplicate WebMCP tool name'),
      }),
    )
    expect(listener).toHaveBeenCalledOnce()

    modelContext.changeTools([other])
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
    expect(listener.mock.lastCall?.[0][0].name).toBe('other_tool')
    controller.abort()
  })
  it('sends the list now and after each toolchange until the signal aborts', async () => {
    const modelContext = installModelContext([weather])
    const controller = new AbortController()
    const listener = vi.fn()

    subscribeWebMCPTools(listener, { signal: controller.signal })
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    expect(
      listener.mock.lastCall?.[0].map((t: { name: string }) => t.name),
    ).toEqual(['get_weather'])

    modelContext.changeTools([weather, other])
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2))
    expect(listener.mock.lastCall?.[0]).toHaveLength(2)

    controller.abort()
    modelContext.changeTools([])
    await Promise.resolve()
    expect(modelContext.getTools).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('ignores a read that finishes after a newer read', async () => {
    const modelContext = installModelContext([])
    let resolveFirst: (tools: Array<WebMCPPageTool>) => void = () => {}
    modelContext.getTools.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve)),
    )
    const listener = vi.fn()

    subscribeWebMCPTools(listener, { signal: new AbortController().signal })
    modelContext.changeTools([other])
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    resolveFirst([weather])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.lastCall?.[0][0].name).toBe('other_tool')
  })

  it('reports read errors to onError', async () => {
    const modelContext = installModelContext([])
    modelContext.getTools.mockRejectedValueOnce(new Error('NotAllowedError'))
    const listener = vi.fn()
    const onError = vi.fn()

    subscribeWebMCPTools(listener, {
      signal: new AbortController().signal,
      onError,
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(listener).not.toHaveBeenCalled()
  })

  it('sends an empty list once without WebMCP', () => {
    vi.stubGlobal('document', {})
    const listener = vi.fn()

    subscribeWebMCPTools(listener, { signal: new AbortController().signal })

    expect(listener).toHaveBeenCalledExactlyOnceWith([])
  })
})
