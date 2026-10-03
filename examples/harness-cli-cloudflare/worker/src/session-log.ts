import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

/**
 * The log of one session, in this Durable Object's SQLite storage. A
 * Durable Object runs one request at a time, and the check and the writes
 * of an append run with no await between them, so two appends never mix.
 */
export class SessionLog extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS log (seq INTEGER PRIMARY KEY, record TEXT NOT NULL)',
    )
  }

  /** The last position, or 0 for an empty log. */
  private last() {
    const row = this.ctx.storage.sql
      .exec<{ last: number }>('SELECT COALESCE(MAX(seq), 0) AS last FROM log')
      .one()
    return row.last
  }

  /**
   * Write `records` at `seq`, `seq + 1`, and so on, all or none. `false`
   * when `seq` is not the next free position.
   */
  append(seq: number, records: Array<unknown>) {
    if (records.length === 0) return true
    if (seq !== this.last() + 1) return false
    this.ctx.storage.transactionSync(() => {
      for (const [index, record] of records.entries()) {
        this.ctx.storage.sql.exec(
          'INSERT INTO log (seq, record) VALUES (?, ?)',
          seq + index,
          JSON.stringify(record),
        )
      }
    })
    return true
  }

  /** The entries after `after`, at most `limit` of them. */
  read(after: number, limit?: number) {
    const rows = this.ctx.storage.sql
      .exec<{ seq: number; record: string }>(
        'SELECT seq, record FROM log WHERE seq > ? ORDER BY seq LIMIT ?',
        after,
        limit ?? -1,
      )
      .toArray()
    return rows.map((row) => {
      const record: unknown = JSON.parse(row.record)
      return { seq: row.seq, record }
    })
  }
}
