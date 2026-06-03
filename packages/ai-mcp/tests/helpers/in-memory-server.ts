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
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
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
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
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
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { server, clientTransport }
}
