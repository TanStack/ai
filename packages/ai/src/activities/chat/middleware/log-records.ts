import { createCapability } from './capabilities'

/**
 * One record of a session log. `type` names the kind of record. The other
 * fields are JSON.
 */
export interface LogRecord {
  type: string
  [key: string]: unknown
}

/**
 * Appends records to the session log that a host keeps. A host is a
 * middleware that provides this capability. `chat()` does not provide it.
 */
export interface LogRecordsWriter {
  /**
   * Resolves when the host has written all the records. Rejects when the
   * host refuses a record or the write fails. Then the host writes none of
   * the records. The host decides which record types it accepts.
   */
  append: (records: ReadonlyArray<LogRecord>) => Promise<void>
}

export const LogRecordsCapability =
  createCapability<LogRecordsWriter>()('log-records')

export const [getLogRecords, provideLogRecords] = LogRecordsCapability
