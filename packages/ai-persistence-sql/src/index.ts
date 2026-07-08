// SQL driver contract + dialect helpers (the seam each backend implements).
export {
  param,
  params,
  autoIncrementPk,
  jsonColumn,
  textColumn,
  blobColumn,
  bigIntColumn,
  identifier,
  stringKeyColumn,
  insertDoNothingPrefix,
  insertDoNothingSuffix,
  upsertUpdateSuffix,
} from './driver'
export type { Dialect, SqlRow, SqlDriver } from './driver'

// Schema migrations + raw DDL
export { migrate, ddl } from './migrations'

// Migration CLI types. Runtime CLI helpers live on the ./cli-core subpath.
export type {
  CliDialect,
  CliOptions,
  CliResult,
  MigrationCliConfig,
} from './cli-core'

// Shared SQL stores (one impl per store, dialect-parameterized)
export {
  createMessageStore,
  createRunStore,
  createEventLog,
  createLegacyEventLog,
  createInternalEventStore,
  createInterruptStore,
  createApprovalStore,
  createMetadataStore,
} from './stores'

// Assemble a SqlPersistence from a driver
export { createSqlPersistence } from './sql-persistence'
export type { SqlPersistence, SqlPersistenceOptions } from './sql-persistence'
