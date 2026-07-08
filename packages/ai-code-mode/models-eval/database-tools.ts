/* eslint-disable @typescript-eslint/require-await -- toolDefinition .server uses async handlers */
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'

// ─── In-memory database ────────────────────────────────────────────────────

interface Customer {
  id: number
  name: string
  email: string
  city: string
  joined: string
}

interface Product {
  id: number
  name: string
  category: string
  price: number
  stock: number
}

interface Purchase {
  id: number
  customer_id: number
  product_id: number
  quantity: number
  total: number
  purchased_at: string
}

const CUSTOMERS: Array<Customer> = [
  {
    id: 1,
    name: 'Alice Johnson',
    email: 'alice@example.com',
    city: 'New York',
    joined: '2024-01-15',
  },
  {
    id: 2,
    name: 'Bob Smith',
    email: 'bob@example.com',
    city: 'San Francisco',
    joined: '2024-02-20',
  },
  {
    id: 3,
    name: 'Carol Williams',
    email: 'carol@example.com',
    city: 'Chicago',
    joined: '2024-03-10',
  },
  {
    id: 4,
    name: 'David Brown',
    email: 'david@example.com',
    city: 'Austin',
    joined: '2024-04-05',
  },
  {
    id: 5,
    name: 'Eva Martinez',
    email: 'eva@example.com',
    city: 'Seattle',
    joined: '2024-05-18',
  },
  {
    id: 6,
    name: 'Frank Lee',
    email: 'frank@example.com',
    city: 'New York',
    joined: '2024-06-01',
  },
  {
    id: 7,
    name: 'Grace Kim',
    email: 'grace@example.com',
    city: 'San Francisco',
    joined: '2024-07-22',
  },
  {
    id: 8,
    name: 'Henry Davis',
    email: 'henry@example.com',
    city: 'Chicago',
    joined: '2024-08-14',
  },
  {
    id: 9,
    name: 'Ivy Chen',
    email: 'ivy@example.com',
    city: 'Austin',
    joined: '2024-09-30',
  },
  {
    id: 10,
    name: 'Jack Wilson',
    email: 'jack@example.com',
    city: 'Seattle',
    joined: '2024-10-12',
  },
]

const PRODUCTS: Array<Product> = [
  {
    id: 1,
    name: 'Wireless Mouse',
    category: 'Electronics',
    price: 29.99,
    stock: 150,
  },
  {
    id: 2,
    name: 'Mechanical Keyboard',
    category: 'Electronics',
    price: 89.99,
    stock: 75,
  },
  {
    id: 3,
    name: 'USB-C Hub',
    category: 'Electronics',
    price: 49.99,
    stock: 200,
  },
  {
    id: 4,
    name: 'Standing Desk',
    category: 'Furniture',
    price: 399.99,
    stock: 30,
  },
  {
    id: 5,
    name: 'Ergonomic Chair',
    category: 'Furniture',
    price: 299.99,
    stock: 45,
  },
  {
    id: 6,
    name: 'Monitor Light Bar',
    category: 'Electronics',
    price: 59.99,
    stock: 120,
  },
  {
    id: 7,
    name: 'Desk Organizer',
    category: 'Office',
    price: 24.99,
    stock: 300,
  },
  { id: 8, name: 'Notebook Set', category: 'Office', price: 14.99, stock: 500 },
  {
    id: 9,
    name: 'Webcam HD',
    category: 'Electronics',
    price: 69.99,
    stock: 90,
  },
  {
    id: 10,
    name: 'Desk Lamp',
    category: 'Furniture',
    price: 44.99,
    stock: 180,
  },
]

const PURCHASES: Array<Purchase> = [
  {
    id: 1,
    customer_id: 1,
    product_id: 2,
    quantity: 1,
    total: 89.99,
    purchased_at: '2024-03-01',
  },
  {
    id: 2,
    customer_id: 1,
    product_id: 3,
    quantity: 2,
    total: 99.98,
    purchased_at: '2024-03-15',
  },
  {
    id: 3,
    customer_id: 2,
    product_id: 1,
    quantity: 3,
    total: 89.97,
    purchased_at: '2024-04-02',
  },
  {
    id: 4,
    customer_id: 2,
    product_id: 5,
    quantity: 1,
    total: 299.99,
    purchased_at: '2024-04-10',
  },
  {
    id: 5,
    customer_id: 3,
    product_id: 4,
    quantity: 1,
    total: 399.99,
    purchased_at: '2024-05-01',
  },
  {
    id: 6,
    customer_id: 3,
    product_id: 7,
    quantity: 4,
    total: 99.96,
    purchased_at: '2024-05-20',
  },
  {
    id: 7,
    customer_id: 4,
    product_id: 6,
    quantity: 2,
    total: 119.98,
    purchased_at: '2024-06-05',
  },
  {
    id: 8,
    customer_id: 4,
    product_id: 8,
    quantity: 5,
    total: 74.95,
    purchased_at: '2024-06-18',
  },
  {
    id: 9,
    customer_id: 5,
    product_id: 9,
    quantity: 1,
    total: 69.99,
    purchased_at: '2024-07-01',
  },
  {
    id: 10,
    customer_id: 5,
    product_id: 10,
    quantity: 1,
    total: 44.99,
    purchased_at: '2024-07-15',
  },
  {
    id: 11,
    customer_id: 6,
    product_id: 2,
    quantity: 2,
    total: 179.98,
    purchased_at: '2024-08-01',
  },
  {
    id: 12,
    customer_id: 6,
    product_id: 1,
    quantity: 1,
    total: 29.99,
    purchased_at: '2024-08-20',
  },
  {
    id: 13,
    customer_id: 7,
    product_id: 4,
    quantity: 1,
    total: 399.99,
    purchased_at: '2024-09-05',
  },
  {
    id: 14,
    customer_id: 7,
    product_id: 3,
    quantity: 1,
    total: 49.99,
    purchased_at: '2024-09-15',
  },
  {
    id: 15,
    customer_id: 8,
    product_id: 5,
    quantity: 1,
    total: 299.99,
    purchased_at: '2024-10-01',
  },
  {
    id: 16,
    customer_id: 8,
    product_id: 6,
    quantity: 3,
    total: 179.97,
    purchased_at: '2024-10-10',
  },
  {
    id: 17,
    customer_id: 9,
    product_id: 7,
    quantity: 2,
    total: 49.98,
    purchased_at: '2024-10-20',
  },
  {
    id: 18,
    customer_id: 9,
    product_id: 9,
    quantity: 1,
    total: 69.99,
    purchased_at: '2024-11-01',
  },
  {
    id: 19,
    customer_id: 10,
    product_id: 10,
    quantity: 2,
    total: 89.98,
    purchased_at: '2024-11-10',
  },
  {
    id: 20,
    customer_id: 10,
    product_id: 2,
    quantity: 1,
    total: 89.99,
    purchased_at: '2024-11-25',
  },
  {
    id: 21,
    customer_id: 1,
    product_id: 6,
    quantity: 1,
    total: 59.99,
    purchased_at: '2024-12-01',
  },
  {
    id: 22,
    customer_id: 3,
    product_id: 9,
    quantity: 2,
    total: 139.98,
    purchased_at: '2024-12-10',
  },
  {
    id: 23,
    customer_id: 5,
    product_id: 4,
    quantity: 1,
    total: 399.99,
    purchased_at: '2024-12-15',
  },
  {
    id: 24,
    customer_id: 2,
    product_id: 8,
    quantity: 10,
    total: 149.9,
    purchased_at: '2024-12-20',
  },
  {
    id: 25,
    customer_id: 4,
    product_id: 3,
    quantity: 3,
    total: 149.97,
    purchased_at: '2024-12-28',
  },
]

// ─── Simple query engine ───────────────────────────────────────────────────

type Table = 'customers' | 'products' | 'purchases'

const TABLES: Record<Table, Array<Record<string, unknown>>> = {
  customers: CUSTOMERS as unknown as Array<Record<string, unknown>>,
  products: PRODUCTS as unknown as Array<Record<string, unknown>>,
  purchases: PURCHASES as unknown as Array<Record<string, unknown>>,
}

function getTableSchema(table: Table): Record<string, string> {
  const schemas: Record<Table, Record<string, string>> = {
    customers: {
      id: 'number',
      name: 'string',
      email: 'string',
      city: 'string',
      joined: 'string (date)',
    },
    products: {
      id: 'number',
      name: 'string',
      category: 'string',
      price: 'number',
      stock: 'number',
    },
    purchases: {
      id: 'number',
      customer_id: 'number',
      product_id: 'number',
      quantity: 'number',
      total: 'number',
      purchased_at: 'string (date)',
    },
  }
  return schemas[table]
}

function evaluateCondition(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (row[key] !== value) return false
  }
  return true
}

// ─── Tool definitions ──────────────────────────────────────────────────────

export const queryTableTool = toolDefinition({
  name: 'queryTable',
  description:
    'Query an in-memory database table. Supports filtering rows by exact-match conditions on columns, selecting specific columns, ordering by a column, and limiting results. Available tables: customers (id, name, email, city, joined), products (id, name, category, price, stock), purchases (id, customer_id, product_id, quantity, total, purchased_at).',
  inputSchema: z.object({
    table: z
      .enum(['customers', 'products', 'purchases'])
      .describe('The table to query'),
    columns: z
      .array(z.string())
      .optional()
      .describe('Columns to return. If omitted, all columns are returned.'),
    where: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe(
        'Filter conditions as key-value pairs (exact match). Example: { "city": "New York" }',
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
  if (!(table in TABLES)) {
    throw new Error(
      `Invalid table "${String(table)}". Use "customers", "products", or "purchases". ` +
        `Call external_queryTable({ table: "purchases" }) with an object — not SQL strings.`,
    )
  }
  const tableData = TABLES[table]
  let rows = [...tableData]

  // Filter
  if (where && Object.keys(where).length > 0) {
    rows = rows.filter((row) => evaluateCondition(row, where))
  }

  const totalMatchingRows = rows.length

  // Order
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

  // Limit
  if (limit !== undefined) {
    rows = rows.slice(0, limit)
  }

  // Select columns
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
    'Get schema information for one or all database tables. Returns column names and types. Use this to understand what data is available before querying.',
  inputSchema: z.object({
    table: z
      .enum(['customers', 'products', 'purchases'])
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
  const tables: Array<Table> = table
    ? [table]
    : ['customers', 'products', 'purchases']
  const schemas: Record<string, Record<string, string>> = {}
  const rowCounts: Record<string, number> = {}
  for (const t of tables) {
    schemas[t] = getTableSchema(t)
    rowCounts[t] = TABLES[t].length
  }
  return { schemas, rowCounts }
})

export const databaseTools = [queryTableTool, getSchemaInfoTool]
