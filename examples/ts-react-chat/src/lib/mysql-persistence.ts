import mysql from 'mysql2/promise'
import { createSqlPersistence } from '@tanstack/ai-persistence-sql'
import type {
  FieldPacket,
  Pool,
  PoolConnection,
  PoolOptions,
  QueryResult,
  RowDataPacket,
} from 'mysql2/promise'
import type { ExecuteValues } from 'mysql2'
import type { SqlDriver } from '@tanstack/ai-persistence-sql'

let pool: Pool | undefined

interface MysqlExecutable {
  execute<T extends QueryResult>(
    sql: string,
    values?: Array<ExecuteValues>,
  ): Promise<[T, Array<FieldPacket>]>
}

function readPort(value: string | undefined): number | undefined {
  if (!value) return undefined
  const port = Number(value)
  return Number.isInteger(port) && port > 0 ? port : undefined
}

function createPoolOptions(): string | PoolOptions {
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: readPort(process.env.MYSQL_PORT) ?? 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'tanstack_ai_chat',
    waitForConnections: true,
    connectionLimit: 10,
  }
}

function getPool(): Pool {
  const options = createPoolOptions()
  pool ??=
    typeof options === 'string'
      ? mysql.createPool(options)
      : mysql.createPool(options)
  return pool
}

function isExecuteValue(value: unknown): value is ExecuteValues {
  if (value === null) return true
  if (value === undefined) return false
  const type = typeof value
  if (
    type === 'string' ||
    type === 'number' ||
    type === 'bigint' ||
    type === 'boolean'
  ) {
    return true
  }
  if (
    value instanceof Date ||
    value instanceof Buffer ||
    value instanceof Uint8Array
  ) {
    return true
  }
  if (Array.isArray(value)) return value.every(isExecuteValue)
  if (type === 'object') {
    return Object.values(value).every(isExecuteValue)
  }
  return false
}

function toExecuteValues(params: ReadonlyArray<unknown>): Array<ExecuteValues> {
  return params.map((param) => {
    if (!isExecuteValue(param)) {
      throw new TypeError('Unsupported MySQL bind parameter value')
    }
    return param
  })
}

function createDriver(
  execute: MysqlExecutable,
  getConnection: () => Promise<PoolConnection>,
): SqlDriver {
  const driver: SqlDriver = {
    dialect: 'mysql' as SqlDriver['dialect'],
    async exec(sql, params = []) {
      await execute.execute(sql, toExecuteValues(params))
    },
    async query<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ): Promise<Array<T>> {
      const [rows] = await execute.execute<Array<RowDataPacket>>(
        sql,
        toExecuteValues(params),
      )
      return rows.map((row) => ({ ...row })) as Array<T>
    },
    async transaction(fn) {
      const connection = await getConnection()
      const tx = createDriver(connection, getConnection)
      try {
        await connection.execute(
          'SET TRANSACTION ISOLATION LEVEL READ COMMITTED',
        )
        await connection.beginTransaction()
        const result = await fn(tx)
        await connection.commit()
        return result
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
  }
  return driver
}

export function createMysqlPersistence(mysqlPool: Pool = getPool()) {
  return createSqlPersistence(
    createDriver(mysqlPool, () => mysqlPool.getConnection()),
    { migrate: true },
  )
}
