import { vi } from 'vitest'
import { createOpenAIClient } from '../src/client'

/** A mock `create` call. Tests check what the adapter does with its result. */
type Create = (...args: Array<any>) => any

/**
 * Our client with `responses.create` and `chat.completions.create` sent to
 * the given mocks. Any other request fails, so no request leaves the test.
 */
export function stubClient({
  responses,
  completions,
}: {
  responses?: Create
  completions?: Create
}) {
  const client = createOpenAIClient({
    apiKey: 'test-key',
    maxRetries: 0,
    fetch: () => Promise.reject(new Error('No network in this test')),
  })
  if (responses)
    vi.spyOn(client.responses, 'create').mockImplementation(responses)
  if (completions)
    vi.spyOn(client.chat.completions, 'create').mockImplementation(completions)
  return client
}
