import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

/** A stored row: the JSON of a value. */
type Row = { value: string }

/**
 * The account of the CLI, in one Durable Object's SQLite storage: the
 * settings and plugin state, the keys (encrypted by the Worker before they
 * get here), the media records, and the list of sessions.
 */
export class Account extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const sql = ctx.storage.sql
    sql.exec(
      'CREATE TABLE IF NOT EXISTS metadata (namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (namespace, key))',
    )
    sql.exec(
      'CREATE TABLE IF NOT EXISTS credentials (owner TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, expires_at INTEGER, value TEXT NOT NULL, PRIMARY KEY (owner, id))',
    )
    sql.exec(
      'CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, thread_id TEXT NOT NULL, created_at INTEGER NOT NULL, value TEXT NOT NULL)',
    )
    sql.exec(
      'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, updated_at INTEGER NOT NULL)',
    )
  }

  private get sql() {
    return this.ctx.storage.sql
  }

  /** The JSON of each row's value, parsed. */
  private values(cursor: SqlStorageCursor<Row>) {
    return cursor.toArray().map((row): unknown => JSON.parse(row.value))
  }

  getMetadata(namespace: string, key: string) {
    const [value] = this.values(
      this.sql.exec<Row>(
        'SELECT value FROM metadata WHERE namespace = ? AND key = ?',
        namespace,
        key,
      ),
    )
    return value ?? null
  }

  setMetadata(namespace: string, key: string, value: unknown) {
    this.sql.exec(
      'INSERT INTO metadata (namespace, key, value) VALUES (?, ?, ?) ON CONFLICT (namespace, key) DO UPDATE SET value = excluded.value',
      namespace,
      key,
      JSON.stringify(value),
    )
  }

  deleteMetadata(namespace: string, key: string) {
    this.sql.exec(
      'DELETE FROM metadata WHERE namespace = ? AND key = ?',
      namespace,
      key,
    )
  }

  /** The sealed credential `id` of `owner`, or `null`. */
  getCredential(owner: string, id: string) {
    const [row] = this.sql
      .exec<Row>(
        'SELECT value FROM credentials WHERE owner = ? AND id = ?',
        owner,
        id,
      )
      .toArray()
    return row?.value ?? null
  }

  /** Save a sealed credential. `expiresAt` is not secret: `list` shows it. */
  setCredential(
    owner: string,
    id: string,
    type: string,
    expiresAt: number | null,
    sealed: string,
  ) {
    this.sql.exec(
      'INSERT INTO credentials (owner, id, type, expires_at, value) VALUES (?, ?, ?, ?, ?) ON CONFLICT (owner, id) DO UPDATE SET type = excluded.type, expires_at = excluded.expires_at, value = excluded.value',
      owner,
      id,
      type,
      expiresAt,
      sealed,
    )
  }

  deleteCredential(owner: string, id: string) {
    this.sql.exec(
      'DELETE FROM credentials WHERE owner = ? AND id = ?',
      owner,
      id,
    )
  }

  /** The ids, types, and expiry times of `owner`'s keys. No values. */
  listCredentials(owner: string) {
    return this.sql
      .exec<{ id: string; type: string; expiresAt: number | null }>(
        'SELECT id, type, expires_at AS expiresAt FROM credentials WHERE owner = ? ORDER BY id',
        owner,
      )
      .toArray()
      .map(({ expiresAt, ...item }) =>
        expiresAt === null ? item : { ...item, expiresAt },
      )
  }

  saveArtifact(
    id: string,
    runId: string,
    threadId: string,
    createdAt: number,
    record: unknown,
  ) {
    this.sql.exec(
      'INSERT INTO artifacts (id, run_id, thread_id, created_at, value) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET run_id = excluded.run_id, thread_id = excluded.thread_id, created_at = excluded.created_at, value = excluded.value',
      id,
      runId,
      threadId,
      createdAt,
      JSON.stringify(record),
    )
  }

  getArtifact(id: string) {
    const [record] = this.values(
      this.sql.exec<Row>('SELECT value FROM artifacts WHERE id = ?', id),
    )
    return record ?? null
  }

  /**
   * The records of a run or a thread, by `createdAt`, then by id. SQLite
   * compares TEXT as UTF-8 bytes, the order the contract asks for.
   */
  listArtifacts(column: 'run_id' | 'thread_id', id: string) {
    return this.values(
      this.sql.exec<Row>(
        `SELECT value FROM artifacts WHERE ${column} = ? ORDER BY created_at, id`,
        id,
      ),
    )
  }

  deleteArtifact(id: string) {
    this.sql.exec('DELETE FROM artifacts WHERE id = ?', id)
  }

  deleteArtifactsForRun(runId: string) {
    this.sql.exec('DELETE FROM artifacts WHERE run_id = ?', runId)
  }

  /**
   * Mark session `id` as changed at `at`. Its title is what the user said
   * first, kept from the first append that has it.
   */
  touchSession(id: string, title: string | undefined, at: number) {
    this.sql.exec(
      `INSERT INTO sessions (id, title, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at,
         title = CASE WHEN sessions.title = '' THEN excluded.title ELSE sessions.title END`,
      id,
      title ?? '',
      at,
    )
  }

  /** The newest sessions that have a title, at most `limit`. */
  listSessions(limit: number) {
    return this.sql
      .exec<{ id: string; title: string; updatedAt: number }>(
        "SELECT id, title, updated_at AS updatedAt FROM sessions WHERE title != '' ORDER BY updated_at DESC LIMIT ?",
        limit,
      )
      .toArray()
  }
}
