import { describe, expect, it } from 'vitest'
import { stdioTransport } from '../src/stdio'

describe('stdioTransport', () => {
  it('builds a Transport instance without starting it', () => {
    const transport = stdioTransport({ command: 'node' })
    expect(typeof transport.start).toBe('function')
    expect(typeof transport.send).toBe('function')
    expect(typeof transport.close).toBe('function')
  })
})
