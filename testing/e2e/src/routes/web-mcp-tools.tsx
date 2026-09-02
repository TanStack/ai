import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { useWebMCPTools } from '@tanstack/ai-react'
import { z } from 'zod'

interface RegisteredWebMCPTool {
  name: string
}

interface WebMCPModelContext extends EventTarget {
  getTools: () => Promise<Array<RegisteredWebMCPTool>>
  executeTool: (
    tool: RegisteredWebMCPTool,
    input: object,
    options: { signal: AbortSignal },
  ) => Promise<string>
}

function isWebMCPModelContext(value: unknown): value is WebMCPModelContext {
  if (!(value instanceof EventTarget)) return false

  const hasGetTools =
    'getTools' in value && typeof value.getTools === 'function'
  const hasExecuteTool =
    'executeTool' in value && typeof value.executeTool === 'function'
  return hasGetTools && hasExecuteTool
}

function getWebMCPModelContext() {
  if (typeof document === 'undefined' || !('modelContext' in document)) {
    return
  }

  const modelContext = document.modelContext
  if (!isWebMCPModelContext(modelContext)) {
    return
  }

  return modelContext
}

const findGuitar = toolDefinition({
  name: 'find_guitar',
  description: 'Find a guitar in the local test catalog.',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ message: z.string() }),
}).client((input) => ({ message: `Found ${input.query}` }))

const tools = [findGuitar] as const
const webMCPOptions = {
  toolOptions: {
    find_guitar: {
      title: 'Find guitar',
      annotations: { readOnlyHint: true },
    },
  },
}

export const Route = createFileRoute('/web-mcp-tools')({
  component: WebMCPToolsPage,
})

function ToolOwner() {
  useWebMCPTools(tools, webMCPOptions)
  return null
}

function WebMCPToolsPage() {
  const [ownerMounted, setOwnerMounted] = useState(true)
  const [registeredCount, setRegisteredCount] = useState(0)
  const [toolResult, setToolResult] = useState('Not run')

  useEffect(() => {
    const modelContext = getWebMCPModelContext()
    if (!modelContext) return

    let active = true
    const updateRegisteredCount = async () => {
      const registeredTools = await modelContext.getTools()
      if (active) {
        setRegisteredCount(registeredTools.length)
      }
    }
    const handleToolChange = () => {
      void updateRegisteredCount()
    }

    modelContext.addEventListener('toolchange', handleToolChange)
    void updateRegisteredCount()

    return () => {
      active = false
      modelContext.removeEventListener('toolchange', handleToolChange)
    }
  }, [])

  const executeTool = async () => {
    const modelContext = getWebMCPModelContext()
    if (!modelContext) {
      setToolResult('WebMCP unavailable')
      return
    }

    const registeredTools = await modelContext.getTools()
    const tool = registeredTools.find((item) => item.name === 'find_guitar')
    if (!tool) {
      setToolResult('Tool not found')
      return
    }

    const execution = new AbortController()
    const serializedResult = await modelContext.executeTool(
      tool,
      { query: 'guitar' },
      { signal: execution.signal },
    )
    let result: unknown
    try {
      result = JSON.parse(serializedResult)
    } catch {
      setToolResult('Invalid tool result')
      return
    }

    if (
      result !== null &&
      typeof result === 'object' &&
      'message' in result &&
      typeof result.message === 'string'
    ) {
      setToolResult(result.message)
      return
    }

    setToolResult('Invalid tool result')
  }

  return (
    <section aria-labelledby="web-mcp-heading" className="p-4">
      <h2 id="web-mcp-heading" className="text-xl font-semibold">
        WebMCP tools
      </h2>

      {ownerMounted ? <ToolOwner /> : null}

      <p>
        Registered tools:{' '}
        <output data-testid="registered-count" aria-live="polite">
          {registeredCount}
        </output>
      </p>
      <p>
        Tool result:{' '}
        <output data-testid="tool-result" aria-live="polite">
          {toolResult}
        </output>
      </p>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="min-h-11 rounded bg-orange-500 px-4 py-2 text-gray-950 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
          disabled={registeredCount === 0}
          onClick={() => {
            void executeTool()
          }}
        >
          Execute WebMCP tool
        </button>
        <button
          type="button"
          className="min-h-11 rounded border border-gray-500 px-4 py-2 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
          disabled={!ownerMounted}
          onClick={() => setOwnerMounted(false)}
        >
          Unmount tool owner
        </button>
      </div>
    </section>
  )
}
