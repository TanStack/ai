// packages/ai-mcp/tests/helpers/in-memory-server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { z } from 'zod'

/** Build a connected (server, clientTransport) pair over in-memory transports. */
export async function makeServerWithWeatherTool() {
  const server = new McpServer({ name: 'weather', version: '1.0.0' })
  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: { city: z.string() },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Sunny in ${city}` }],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair whose only tool always returns an MCP error result. */
export async function makeServerWithFailingTool() {
  const server = new McpServer({ name: 'failing', version: '1.0.0' })
  server.registerTool(
    'always_fails',
    {
      description: 'A tool that always returns an error result',
      inputSchema: {},
    },
    async () => ({
      isError: true,
      content: [{ type: 'text' as const, text: 'boom' }],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair with one normal tool and one task-required tool. */
export async function makeServerWithTaskRequiredTool() {
  const server = new McpServer({ name: 'tasky', version: '1.0.0' })
  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: { city: z.string() },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Sunny in ${city}` }],
    }),
  )
  const registered = server.registerTool(
    'research_task',
    {
      description: 'A long-running tool that requires task-based execution',
      inputSchema: { query: z.string() },
    },
    async () => ({
      content: [{ type: 'text' as const, text: 'unreachable via callTool' }],
    }),
  )
  // registerTool's config doesn't accept `execution` directly in SDK 1.29;
  // RegisteredTool exposes it as a mutable property consumed at list time.
  registered.execution = { taskSupport: 'required' }
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair that exposes a static text resource. */
export async function makeServerWithResource() {
  const server = new McpServer({ name: 'resource-server', version: '1.0.0' })
  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'A simple text resource', mimeType: 'text/plain' },
    async (_uri) => ({
      contents: [{ uri: 'file:///hello.txt', text: 'hello from resource' }],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair that exposes a prompt accepting a `code` argument. */
export async function makeServerWithPrompt() {
  const server = new McpServer({ name: 'prompt-server', version: '1.0.0' })
  server.registerPrompt(
    'review-code',
    {
      description: 'Review a code snippet',
      argsSchema: { code: z.string() },
    },
    ({ code }) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: `Please review: ${code}` },
        },
      ],
    }),
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}

/** Build a connected (server, clientTransport) pair that exposes one tool, one resource, and one prompt. */
export async function makeFullServer() {
  const server = new McpServer({ name: 'full-server', version: '1.0.0' })

  server.registerTool(
    'get_weather',
    {
      description: 'Get weather for a city',
      inputSchema: { city: z.string() },
    },
    async ({ city }) => ({
      content: [{ type: 'text' as const, text: `Sunny in ${city}` }],
    }),
  )

  server.registerResource(
    'hello',
    'file:///hello.txt',
    { description: 'A simple text resource', mimeType: 'text/plain' },
    async (_uri) => ({
      contents: [{ uri: 'file:///hello.txt', text: 'hello from resource' }],
    }),
  )

  server.registerPrompt(
    'review-code',
    {
      description: 'Review a code snippet',
      argsSchema: { code: z.string() },
    },
    ({ code }) => ({
      messages: [
        {
          role: 'user' as const,
          content: { type: 'text' as const, text: `Please review: ${code}` },
        },
      ],
    }),
  )

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}
