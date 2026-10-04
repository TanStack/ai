import { describe, expect, it } from 'vitest'
import {
  LogRecordsCapability,
  getLogRecords,
  provideLogRecords,
} from '../src/index'
import { CapabilityRegistry } from '../src/activities/chat/middleware/capabilities'
import type { LogRecordsWriter } from '../src/index'

describe('LogRecordsCapability', () => {
  it('reads as undefined when no host provides it', () => {
    const ctx = { capabilities: new CapabilityRegistry() }
    expect(getLogRecords(ctx, { optional: true })).toBeUndefined()
  })

  it('gives a middleware the writer that the host provides', async () => {
    const ctx = { capabilities: new CapabilityRegistry() }
    const written: Array<unknown> = []
    const writer: LogRecordsWriter = {
      append: async (records) => {
        written.push(...records)
      },
    }
    provideLogRecords(ctx, writer)

    await getLogRecords(ctx).append([{ type: 'app.note', text: 'hi' }])

    expect(written).toEqual([{ type: 'app.note', text: 'hi' }])
    expect(LogRecordsCapability.capabilityName).toBe('log-records')
  })
})
