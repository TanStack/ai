import { createCapability } from './capabilities'

/**
 * Appends records to the durable session log of this run. A host with a
 * session log provides it, for example a durable harness session. The host
 * checks the records, writes them at once, and folds them into the context.
 */
export interface LogRecordsWriter {
  append: (
    records: ReadonlyArray<{ type: string } & Record<string, unknown>>,
  ) => Promise<void>
}

export const LogRecordsCapability =
  createCapability<LogRecordsWriter>()('log-records')

export const [getLogRecords, provideLogRecords] = LogRecordsCapability
