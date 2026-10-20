import {
  createHarnessHost,
  defineHarness,
  membersOnly,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { describe, expect, it, vi } from 'vitest'
import { createHarnessMcpServer } from '../src/harness'
import { serveMCPStdio } from '../src/server/stdio'

// The stdio transport of the SDK reads the real stdin. This fake gets the
// messages of the test, and keeps what the server sends back.
const fake = vi.hoisted(() => {
  class FakeTransport {
    sent: Array<unknown> = []
    onmessage?: (message: unknown) => void
    onerror?: (error: Error) => void
    constructor() {
      fake.transports.push(this)
    }
    start() {
      return Promise.resolve()
    }
    send(message: unknown) {
      this.sent.push(message)
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
  }
  return {
    FakeTransport,
    transports: [] as Array<InstanceType<typeof FakeTransport>>,
  }
})

vi.mock('@modelcontextprotocol/server/stdio', () => ({
  StdioServerTransport: fake.FakeTransport,
}))

describe('createHarnessMcpServer over stdio', () => {
  it('refuses each message for a host with access, and says why on stderr', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: { getUser: () => null, rules: membersOnly() },
    })
    const server = await createHarnessMcpServer({
      host,
      harness: defineHarness({ name: 'test/stdio' }),
    })
    const served = serveMCPStdio(server)
    const transport = fake.transports.at(-1)
    try {
      transport?.onmessage?.({ jsonrpc: '2.0', id: 1, method: 'tools/list' })

      await vi.waitFor(() =>
        expect(transport?.sent).toEqual([
          {
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32603, message: 'Internal server error' },
          },
        ]),
      )
      expect(errors).toHaveBeenCalledWith(
        'createHarnessMcpServer: a host with access reads the user of each HTTP request, so it cannot serve over stdio. For one local user, use a host without access and openAccess: { user }.',
      )
    } finally {
      await served.close()
      await host.close()
      errors.mockRestore()
    }
  })
})
