import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { getTableConfig as getPgTableConfig } from 'drizzle-orm/pg-core'
import { createDefaultSqliteSchema } from '../src/default-sqlite-schema'
import { createDefaultPgSchema } from '../src/default-pg-schema'
import { schema as emitted } from '../src/assets/tanstack-ai-schema'
import { schema as emittedPg } from '../src/assets/tanstack-ai-schema-pg'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

function normalizeConfig(
  config:
    | ReturnType<typeof getTableConfig>
    | ReturnType<typeof getPgTableConfig>,
) {
  return {
    name: config.name,
    columns: config.columns.map((column) => ({
      name: column.name,
      sqlType: column.getSQLType(),
      notNull: column.notNull,
      primary: column.primary,
    })),
    primaryKeys: config.primaryKeys.map((primaryKey) =>
      primaryKey.columns.map((column) => column.name),
    ),
    indexes: config.indexes.map((index) => ({
      name: index.config.name,
      unique: index.config.unique,
      columns: index.config.columns.map((column) =>
        'name' in column ? column.name : String(column),
      ),
    })),
  }
}

function normalize(table: SQLiteTable) {
  return normalizeConfig(getTableConfig(table))
}

function normalizePg(table: PgTable) {
  return normalizeConfig(getPgTableConfig(table))
}

describe('emitted schema asset', () => {
  it('is structurally identical to createDefaultSqliteSchema()', () => {
    const defaults = createDefaultSqliteSchema()
    const tableKeys = Object.keys(defaults) as Array<keyof typeof defaults>
    expect(Object.keys(emitted)).toEqual(Object.keys(defaults))
    for (const key of tableKeys) {
      expect(normalize(emitted[key]), key).toEqual(normalize(defaults[key]))
    }
  })
})

describe('emitted pg schema asset', () => {
  it('is structurally identical to createDefaultPgSchema()', () => {
    const defaults = createDefaultPgSchema()
    const tableKeys = Object.keys(defaults) as Array<keyof typeof defaults>
    expect(Object.keys(emittedPg)).toEqual(Object.keys(defaults))
    for (const key of tableKeys) {
      expect(normalizePg(emittedPg[key]), key).toEqual(
        normalizePg(defaults[key]),
      )
    }
  })
})
