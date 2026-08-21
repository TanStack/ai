import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatClient } from '../src/chat-client'
import { createMockConnectionAdapter, createTextChunks } from './test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Live `processIncomingChunk` either awaits `setTimeout(0)` (visible / Node)
 * or skips it (hidden). A marker timer scheduled *before* sendMessage has
 * not run yet if sendMessage never awaited a macrotask.
 */
async function streamWithMacrotaskMarker(documentHidden?: boolean) {
  if (documentHidden !== undefined) {
    vi.stubGlobal('document', { hidden: documentHidden })
  }

  const chunks = createTextChunks('ab')
  const client = new ChatClient({
    connection: createMockConnectionAdapter({ chunks }),
  })
  let macrotaskRan = false
  setTimeout(() => {
    macrotaskRan = true
  }, 0)
  await client.sendMessage('Hi')
  return macrotaskRan
}

describe('ChatClient live yield', () => {
  it('does not await a macrotask after live chunks when the page is hidden', async () => {
    const macrotaskRan = await streamWithMacrotaskMarker(true)
    expect(macrotaskRan).toBe(false)
  })

  it('awaits a macrotask after live chunks when the page is visible', async () => {
    const macrotaskRan = await streamWithMacrotaskMarker(false)
    expect(macrotaskRan).toBe(true)
  })

  it('awaits a macrotask after live chunks when document is missing', async () => {
    expect(typeof document).toBe('undefined')
    const macrotaskRan = await streamWithMacrotaskMarker()
    expect(macrotaskRan).toBe(true)
  })
})
