// Surface A — a chat tool whose IMPLEMENTATION runs in the sandbox, built with
// the promoted `sandboxedChatTool` helper from @tanstack/ai-mcp-sandbox.
//
// The model calls `checkInventory`; its body can only reach `host.db.inventory`.
// If the body tried to `fetch`, read a file, or loop forever, the isolate would
// stop it — the tool can't "go off the rails" no matter what code sits in it.
import { sandboxedChatTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { z } from 'zod'
import { DEFAULT_LIMITS } from './sandbox'
import type { Facades } from '@tanstack/ai-mcp-sandbox'

// The canned "database" — the ONLY thing the snippet can touch. Blast radius is
// exactly this facade; swap for a real query in production (the query/secret
// stays in this closure, never in the isolate).
const INVENTORY: Record<string, { qty: number; warehouse: string }> = {
  'SKU-123': { qty: 42, warehouse: 'PDX' },
  'SKU-777': { qty: 0, warehouse: 'LAX' },
}

const inventoryFacades: Facades = {
  'db.inventory': {
    description: 'Look up one SKU in the warehouse table',
    execute: async (args) => {
      const sku = (args as { sku?: unknown }).sku
      return typeof sku === 'string' ? (INVENTORY[sku] ?? null) : null
    },
  },
}

const INVENTORY_SNIPPET = `
  const row = await host.db.inventory({ sku: input.sku })
  if (!row) return { sku: input.sku, found: false }
  return {
    sku: input.sku,
    found: true,
    inStock: row.qty > 0,
    qty: row.qty,
    warehouse: row.warehouse,
  }
`

export const secureTools = [
  sandboxedChatTool({
    name: 'checkInventory',
    description:
      'Check whether a SKU is in stock and how many units are available. ' +
      'Known SKUs: SKU-123, SKU-777.',
    inputSchema: z.object({
      sku: z.string().describe('The SKU to look up, e.g. "SKU-123"'),
    }),
    snippet: INVENTORY_SNIPPET,
    facades: inventoryFacades,
    driver: createQuickJSIsolateDriver(),
    limits: DEFAULT_LIMITS,
  }),
]
