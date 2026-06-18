// SQL driver contract + dialect helpers (the seam each backend implements).
export {
  param,
  params,
  autoIncrementPk,
  jsonColumn,
  blobColumn,
  bigIntColumn,
} from './driver'
export type { Dialect, SqlRow, SqlDriver } from './driver'

// Schema migrations + raw DDL
export { migrate, ddl } from './migrations'

// Shared SQL stores (one impl per store, dialect-parameterized)
export {
  createMessageStore,
  createRunStore,
  createEventLog,
  createApprovalStore,
  createArtifactStore,
} from './stores'

// Assemble a ChatPersistence from a driver
export { createSqlPersistence } from './sql-persistence'
export type { SqlPersistenceOptions } from './sql-persistence'
