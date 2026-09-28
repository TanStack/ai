import { createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { startOpencodeSession } from '../src/process/server'

/** A local port with nothing listening on it, so a connection fails at once. */
async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

const options = (baseUrl: string) => ({
  baseUrl,
  providerID: 'anthropic',
  modelID: 'claude-sonnet-4-5',
  headers: { 'x-preview-token': 't' },
  directory: '/workspace',
  onEvent: () => {},
  onPermissionRequest: () => 'reject' as const,
})

describe('startOpencodeSession when the server cannot be reached', () => {
  it('rejects when a new session cannot be created', async () => {
    const baseUrl = `http://127.0.0.1:${await closedPort()}`
    await expect(startOpencodeSession(options(baseUrl))).rejects.toBeDefined()
  })

  it('rejects when a session to resume cannot be read', async () => {
    const baseUrl = `http://127.0.0.1:${await closedPort()}`
    await expect(
      startOpencodeSession({ ...options(baseUrl), resumeSessionId: 'ses_1' }),
    ).rejects.toBeDefined()
  })
})
