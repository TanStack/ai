import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

const sqlite = new DatabaseSync(':memory:')

sqlite.exec(`
  CREATE TABLE chat_threads (
    thread_id text PRIMARY KEY,
    messages_json text NOT NULL,
    updated_at integer NOT NULL
  );
  CREATE TABLE chat_runs (
    run_id text PRIMARY KEY,
    thread_id text NOT NULL,
    status text NOT NULL,
    started_at integer NOT NULL,
    finished_at integer,
    error text,
    error_code text,
    usage_json text,
    sandbox_key text,
    detached_since integer,
    cancel_requested integer,
    driver_epoch integer,
    parent_run_id text,
    subagent_run_id text,
    name text
  );
  CREATE TABLE chat_interrupts (
    interrupt_id text PRIMARY KEY,
    run_id text NOT NULL,
    thread_id text NOT NULL,
    status text NOT NULL,
    requested_at integer NOT NULL,
    resolved_at integer,
    payload_json text NOT NULL,
    response_json text
  );
  CREATE TABLE chat_metadata (
    namespace text NOT NULL,
    key text NOT NULL,
    value_json text NOT NULL,
    PRIMARY KEY (namespace, key)
  );
`)

function bind(value: unknown): SQLInputValue {
  if (value == null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return value
  }
  if (value instanceof Uint8Array) return value
  throw new Error(`Unsupported sqlite value: ${typeof value}`)
}

function cells(
  row: Record<string, unknown>,
  columns: ReadonlyArray<{ name: string }>,
): Array<unknown> {
  return columns.map((column) => {
    const value = row[column.name]
    return value === undefined ? null : value
  })
}

export const db = drizzle(async (sql, params, method) => {
  const stmt = sqlite.prepare(sql)
  const bound = params.map(bind)
  if (method === 'run') {
    stmt.run(...bound)
    return { rows: [] }
  }
  const columns = stmt.columns()
  if (method === 'get') {
    const row = stmt.get(...bound)
    return { rows: row ? cells(row, columns) : [] }
  }
  const rows = stmt.all(...bound)
  return { rows: rows.map((row) => cells(row, columns)) }
})
