import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function streamChunks(documentHidden?: boolean) {
  if (documentHidden !== undefined) {
    vi.stubGlobal('document', { hidden: documentHidden })
  }

  const chunks = createTextChunks('ab')
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const client = new ChatClient({
    connection: createMockConnectionAdapter({ chunks }),
  })
  await client.sendMessage('Hi')
  return {
    chunkCount: chunks.length,
    zeroDelayCount: spy.mock.calls.filter((call) => call[1] === 0).length,
  }
}

describe('ChatClient live yield', () => {
  it('does not await setTimeout(0) after live chunks when the page is hidden', async () => {
    const { zeroDelayCount } = await streamChunks(true)
    expect(zeroDelayCount).toBe(0)
  })

  it('awaits setTimeout(0) after every live chunk when the page is visible', async () => {
    const { chunkCount, zeroDelayCount } = await streamChunks(false)
    expect(zeroDelayCount).toBe(chunkCount)
  })

  it('awaits setTimeout(0) after every live chunk when document is missing', async () => {
    expect(typeof document).toBe('undefined')
    const { chunkCount, zeroDelayCount } = await streamChunks()
    expect(zeroDelayCount).toBe(chunkCount)
  })
})
