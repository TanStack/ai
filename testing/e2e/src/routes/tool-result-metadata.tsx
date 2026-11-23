import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import { z } from 'zod'
import { parseAimockPort } from '@/lib/devtools-test'
import { ChatUI } from '@/components/ChatUI'

/**
 * Tool result metadata harness (client half). The page shows the `sources`
 * that the `search_docs` tool sets as result metadata, from
 * `part.resultMetadata`.
 *
 * - `?mode=server` (default): `/api/tool-result-metadata`, a server tool,
 *   aimock, and `persistence: true`. A reload hydrates from the server
 *   transcript.
 * - `?mode=mcp`: `/api/mcp-result-meta-wire`, an MCP tool whose result
 *   `_meta` holds the sources.
 */

// Client stub of the server `search_docs` tool. The stub has the same
// `resultMetadataSchema`, so `part.resultMetadata` is typed. The server runs
// the tool.
const searchDocs = toolDefinition({
  name: 'search_docs',
  description: 'Search the docs',
  inputSchema: z.object({ query: z.string() }),
  resultMetadataSchema: z.object({
    sources: z.array(
      z.object({ id: z.string(), title: z.string(), url: z.string() }),
    ),
  }),
}).client()

const tools = clientTools(searchDocs)

export const Route = createFileRoute('/tool-result-metadata')({
  component: ToolResultMetadataPage,
  validateSearch: (search: Record<string, unknown>) => ({
    testId: typeof search.testId === 'string' ? search.testId : undefined,
    aimockPort: parseAimockPort(search.aimockPort),
    mode: search.mode === 'mcp' ? ('mcp' as const) : ('server' as const),
  }),
})

function ToolResultMetadataPage() {
  const { testId, aimockPort, mode } = Route.useSearch()
  const isServerMode = mode === 'server'
  const connection = useMemo(
    () =>
      fetchServerSentEvents(
        isServerMode
          ? '/api/tool-result-metadata'
          : '/api/mcp-result-meta-wire',
      ),
    [isServerMode],
  )
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const { messages, sendMessage, isLoading } = useChat({
    threadId: `tool-result-metadata-${mode}-${testId ?? 'default'}`,
    connection,
    persistence: isServerMode,
    tools,
    forwardedProps: { testId, aimockPort },
  })

  const sources = messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === 'tool-call' && part.name === 'search_docs'
        ? (part.resultMetadata?.sources ?? [])
        : [],
    ),
  )

  return (
    <>
      {hydrated ? <div data-testid="hydration-marker" hidden /> : null}
      <ChatUI
        messages={messages}
        isLoading={isLoading}
        onSendMessage={(text) => {
          void sendMessage(text)
        }}
      />
      <ul data-testid="result-sources">
        {sources.map((source) => (
          <li key={source.id} data-testid="result-source">
            <a href={source.url}>{source.title}</a>
          </li>
        ))}
      </ul>
    </>
  )
}
