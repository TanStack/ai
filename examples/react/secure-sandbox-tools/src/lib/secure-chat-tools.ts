import { sandboxedChatTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { z } from 'zod'

// The host-side data. The snippet never sees this, only the facade.
const INVENTORY: Record<string, { qty: number; warehouse: string }> = {
  'SKU-123': { qty: 42, warehouse: 'PDX' },
  'SKU-777': { qty: 0, warehouse: 'LAX' },
}

const checkInventory = sandboxedChatTool({
  name: 'checkInventory',
  description:
    'Check whether a SKU is in stock and how many units are available. ' +
    'Known SKUs: SKU-123, SKU-777.',
  inputSchema: z.object({
    sku: z.string().describe('The SKU to look up, e.g. "SKU-123"'),
  }),
  // The tool body. It runs in the isolate and sees only `input` and `host`.
  snippet: `
    const row = await host.db.inventory({ sku: input.sku })
    if (!row) return { sku: input.sku, found: false }
    return { sku: input.sku, found: true, inStock: row.qty > 0, qty: row.qty }
  `,
  // The only thing the snippet can call. Secrets stay in this closure.
  facades: {
    'db.inventory': {
      description: 'Look up one SKU in the warehouse table',
      execute: async (args) => {
        if (typeof args !== 'object' || args === null || !('sku' in args)) {
          throw new Error('sku is required')
        }
        return INVENTORY[String(args.sku)] ?? null
      },
    },
  },
  driver: createQuickJSIsolateDriver(),
  limits: {
    wallClockMs: 2000,
    memoryMb: 64,
    maxInjectedCalls: 5,
    resultBytes: 16 * 1024,
  },
})

export const secureTools = [checkInventory]
