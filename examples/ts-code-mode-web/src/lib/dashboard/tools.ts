import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { TABLES, TABLE_SCHEMAS, type TableName } from './seed-data'

// ─── Query engine ─────────────────────────────────────────────────────────

function evaluateCondition(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (row[key] !== value) return false
  }
  return true
}

// ─── Tool definitions ─────────────────────────────────────────────────────

export const queryTableTool = toolDefinition({
  name: 'queryTable',
  description:
    'Query the e-commerce database. Supports filtering, ordering, limiting, and column selection. Available tables: products (50 products, 5 categories), sales (~1600 records, 4 regions, 4 quarters, 2024-2025), customers (200 customers, 3 tiers, 4 regions), support_tickets (500 tickets with statuses).',
  inputSchema: z.object({
    table: z
      .enum(['products', 'sales', 'customers', 'support_tickets'])
      .describe('The table to query'),
    columns: z
      .array(z.string())
      .optional()
      .describe('Columns to return. If omitted, all columns are returned.'),
    where: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe(
        'Filter conditions as key-value pairs (exact match). Example: { "region": "APAC" }',
      ),
    orderBy: z.string().optional().describe('Column name to sort results by'),
    orderDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction, defaults to asc'),
    limit: z.number().optional().describe('Maximum number of rows to return'),
  }),
  outputSchema: z.object({
    rows: z.array(z.record(z.string(), z.any())),
    totalMatchingRows: z.number(),
  }),
}).server(async ({ table, columns, where, orderBy, orderDirection, limit }) => {
  const tableData = TABLES[table as TableName]
  if (!tableData) {
    throw new Error(`Unknown table: ${table}`)
  }

  let rows = [...tableData]

  if (where && Object.keys(where).length > 0) {
    rows = rows.filter((row) => evaluateCondition(row, where))
  }

  const totalMatchingRows = rows.length

  if (orderBy) {
    const dir = orderDirection === 'desc' ? -1 : 1
    rows.sort((a, b) => {
      const aVal = a[orderBy]
      const bVal = b[orderBy]
      if (typeof aVal === 'number' && typeof bVal === 'number')
        return (aVal - bVal) * dir
      return String(aVal).localeCompare(String(bVal)) * dir
    })
  }

  if (limit !== undefined) {
    rows = rows.slice(0, limit)
  }

  if (columns && columns.length > 0) {
    rows = rows.map((row) => {
      const selected: Record<string, unknown> = {}
      for (const col of columns) {
        if (col in row) selected[col] = row[col]
      }
      return selected
    })
  }

  return { rows, totalMatchingRows }
})

export const getSchemaInfoTool = toolDefinition({
  name: 'getSchemaInfo',
  description:
    'Get schema information for one or all database tables. Returns column names, types, and row counts. Use this to understand what data is available before querying.',
  inputSchema: z.object({
    table: z
      .enum(['products', 'sales', 'customers', 'support_tickets'])
      .optional()
      .describe(
        'Specific table to get schema for. If omitted, returns all table schemas.',
      ),
  }),
  outputSchema: z.object({
    schemas: z.record(z.string(), z.record(z.string(), z.string())),
    rowCounts: z.record(z.string(), z.number()),
  }),
}).server(async ({ table }) => {
  const tables: Array<TableName> = table
    ? [table as TableName]
    : ['products', 'sales', 'customers', 'support_tickets']
  const schemas: Record<string, Record<string, string>> = {}
  const rowCounts: Record<string, number> = {}
  for (const t of tables) {
    schemas[t] = TABLE_SCHEMAS[t]
    rowCounts[t] = TABLES[t].length
  }
  return { schemas, rowCounts }
})

export const dashboardTools = [queryTableTool, getSchemaInfoTool]
