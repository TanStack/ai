import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import {
  fetchServerSentEvents,
  useChat,
  usePageWebMCPTools,
  useRegisterWebMCPTools,
} from '@tanstack/ai-react'
import { z } from 'zod'
import { useState } from 'react'

/**
 * Client half of the page WebMCP tools spec. One part of the page registers
 * WebMCP tools. The chat reads them with `usePageWebMCPTools`, skips
 * `blocked_tool` with the filter, and sends the rest to the server.
 */

const connection = fetchServerSentEvents('/api/web-mcp-page-tools')

const findGuitar = toolDefinition({
  name: 'find_guitar',
  description: 'Find a guitar in the local test catalog.',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ message: z.string() }),
}).client((input) => ({ message: `Found ${input.query}` }))

const blockedTool = toolDefinition({
  name: 'blocked_tool',
  description: 'A page tool that the chat must skip.',
}).client(() => ({ message: 'blocked' }))

const pageToolList = [findGuitar, blockedTool] as const

export const Route = createFileRoute('/web-mcp-page-tools')({
  component: WebMCPPageToolsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    testId: typeof search.testId === 'string' ? search.testId : undefined,
  }),
})

function WebMCPPageToolsPage() {
  const { testId } = Route.useSearch()
  const [toolError, setToolError] = useState('')
  useRegisterWebMCPTools(pageToolList)
  const pageTools = usePageWebMCPTools({
    filter: (tool) => tool.name !== 'blocked_tool',
    onError: (error) => {
      setToolError(error instanceof Error ? error.message : String(error))
    },
  })
  const { messages, sendMessage } = useChat({
    connection,
    tools: pageTools,
    forwardedProps: { testId },
  })

  const toolOutput = messages
    .flatMap((message) => message.parts)
    .flatMap((part) =>
      part.type === 'tool-call' && part.name === 'find_guitar' && part.output
        ? [JSON.stringify(part.output)]
        : [],
    )
    .join('')
  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts)
    .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    .join('')

  return (
    <section aria-labelledby="web-mcp-page-heading" className="p-4">
      <h2 id="web-mcp-page-heading" className="text-xl font-semibold">
        Page WebMCP tools
      </h2>
      {toolError && <p role="alert">{toolError}</p>}
      <p>
        Page tools:{' '}
        <output data-testid="page-tool-names" aria-live="polite">
          {pageTools.map((tool) => tool.name).join(',')}
        </output>
      </p>
      <p>
        Tool output:{' '}
        <output data-testid="tool-output" aria-live="polite">
          {toolOutput}
        </output>
      </p>
      <p>
        Assistant:{' '}
        <output data-testid="assistant-text" aria-live="polite">
          {assistantText}
        </output>
      </p>
      <button
        type="button"
        className="mt-4 min-h-11 rounded bg-orange-500 px-4 py-2 text-gray-950 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
        disabled={pageTools.length === 0}
        onClick={() => {
          void sendMessage('[webmcp-page] find a guitar')
        }}
      >
        Ask the chat
      </button>
    </section>
  )
}
