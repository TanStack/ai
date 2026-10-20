import { describe, expect, it } from 'vitest'
import { SessionFeed } from '../src/feed'
import { createRedactor } from '../src/auth'
import { OperationImpl } from '../src/operation'
import { tapFeed } from '../src/session/helpers'

/** Room for every event of a test. */
const EVENT_BYTES = 1_000_000

/**
 * A new operation on its own feed. Its cancel fails it as `cancelled`, the
 * same as a session does for an operation that did not start.
 */
function createOperation() {
  const feed = tapFeed(
    new SessionFeed({ threadId: 'thread-1', eventBytes: EVENT_BYTES }),
    () => {},
    new Set(),
    createRedactor(),
  )
  return new OperationImpl<string>('chat', feed, (operation) => {
    operation.fail('cancelled', new Error('Cancelled.'))
    return Promise.resolve({ inputId: 'input-1', status: 'accepted' })
  })
}

describe('a settled operation', () => {
  it('stays completed when fail comes after finish', async () => {
    const operation = createOperation()
    operation.finish('completed', 'first answer')
    operation.fail('failed', new Error('Too late.'))

    expect(operation.status()).toBe('completed')
    await expect(operation).resolves.toBe('first answer')
  })

  it('stays failed when finish comes after fail', async () => {
    const operation = createOperation()
    operation.fail('failed', new Error('Model error.'))
    operation.finish('completed', 'too late')

    expect(operation.status()).toBe('failed')
    await expect(operation).rejects.toThrow('Model error.')
  })

  it('stays cancelled when finish comes after cancel', async () => {
    const operation = createOperation()
    await operation.cancel()
    operation.finish('completed', 'too late')

    expect(operation.status()).toBe('cancelled')
    await expect(operation).rejects.toThrow('Cancelled.')
  })

  it('keeps the first result when finish comes twice', async () => {
    const operation = createOperation()
    operation.finish('interrupted', 'first answer')
    operation.finish('completed', 'second answer')

    expect(operation.status()).toBe('interrupted')
    await expect(operation).resolves.toBe('first answer')
  })

  it('keeps its final status when setStatus comes after it settled', async () => {
    const operation = createOperation()
    operation.finish('completed', 'answer')
    operation.setStatus('running')

    expect(operation.status()).toBe('completed')
    expect(operation.isSettled()).toBe(true)
    await expect(operation).resolves.toBe('answer')
  })
})
