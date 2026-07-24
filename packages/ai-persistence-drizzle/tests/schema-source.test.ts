import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { createDefaultSqliteSchema } from '../src/default-sqlite-schema'
import { schema as emitted } from '../src/assets/tanstack-ai-schema'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

function normalize(table: SQLiteTable) {
  const config = getTableConfig(table)
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
  }
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
