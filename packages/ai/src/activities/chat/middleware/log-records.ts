import { createCapability } from './capabilities'

/**
 * Appends records to the durable session log of this run. A host with a
 * session log provides it. The host decides which record types it accepts.
 */
export interface LogRecordsWriter {
  append: (
    records: ReadonlyArray<{ type: string } & Record<string, unknown>>,
  ) => Promise<void>
}

export const LogRecordsCapability =
  createCapability<LogRecordsWriter>()('log-records')

export const [getLogRecords, provideLogRecords] = LogRecordsCapability
