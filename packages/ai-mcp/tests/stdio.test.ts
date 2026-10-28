import { describe, expect, it } from 'vitest'
import { stdioTransport } from '../src/stdio'

describe('stdioTransport', () => {
  it('builds a Transport instance without starting it', () => {
    const transport = stdioTransport({
      command: 'node',
      args: ['server.js'],
      env: { MCP_TEST: '1' },
      cwd: 'C:\\mcp',
    })
    expect(transport.constructor.name).toBe('StdioClientTransport')
    expect(typeof transport.start).toBe('function')
    expect(typeof transport.send).toBe('function')
    expect(typeof transport.close).toBe('function')
    expect(transport.pid).toBeNull()
    expect(Reflect.get(transport, '_serverParams')).toEqual({
      command: 'node',
      args: ['server.js'],
      env: { MCP_TEST: '1' },
      cwd: 'C:\\mcp',
    })
  })
})
