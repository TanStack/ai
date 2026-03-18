import { z } from 'zod'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type { BindingSignalMetadata, Report, UIEffect, UIUpdate } from './types'

export interface HandlerBindingContext {
  report: Report
  onEffect: (effect: UIEffect) => void
  onUIUpdate: (update: UIUpdate) => void
  onBindingCall?: (bindingName: string) => void
}

// ============================================================================
// Signal Metadata for Bindings
// ============================================================================

/**
 * Signal metadata for bindings.
 * Defines which bindings ARE signals and which INVALIDATE signals.
 */
export const BINDING_SIGNAL_METADATA: Record<string, BindingSignalMetadata> = {
  // Read bindings - these ARE signals (components can subscribe to them)
  external_get_balances: {
    signal: 'balances',
  },
  external_get_transactions: {
    signal: 'transactions',
  },

  // Write bindings - these INVALIDATE signals
  external_transfer: {
    invalidates: ['balances', 'transactions'],
  },

  // UI bindings - no signal relationships
  external_ui_toast: {},
  external_report_update_component: {},
  external_report_remove_component: {},
}

/**
 * Get the signals that a binding invalidates when called.
 */
export function getInvalidatedSignals(bindingName: string): string[] {
  return BINDING_SIGNAL_METADATA[bindingName]?.invalidates || []
}

/**
 * Get the signal that a binding provides (if any).
 */
export function getBindingSignal(bindingName: string): string | undefined {
  return BINDING_SIGNAL_METADATA[bindingName]?.signal
}

const noop = async () => ({ success: true })

function createBinding(
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  execute: ToolBinding['execute'],
): ToolBinding {
  return {
    name,
    description,
    inputSchema: convertSchemaToJsonSchema(inputSchema) || {
      type: 'object',
      properties: {},
    },
    outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
    execute,
  }
}

export function createHandlerBindings(
  context?: HandlerBindingContext,
  reportId?: string,
  canvasId: string = 'diagram',
): Record<string, ToolBinding> {
  // Helper to track binding calls
  const track = (name: string) => context?.onBindingCall?.(name)

  return {
    external_ui_toast: createBinding(
      'external_ui_toast',
      'Show a toast message in the UI',
      z.object({
        message: z.string(),
        variant: z.enum(['default', 'success', 'error']).optional(),
      }),
      context
        ? async (params) => {
            track('external_ui_toast')
            const parsed = z
              .object({
                message: z.string(),
                variant: z.enum(['default', 'success', 'error']).optional(),
              })
              .parse(params)
            context.onEffect({
              type: 'toast',
              params: parsed,
            })
            return { success: true }
          }
        : noop,
    ),
    external_report_update_component: createBinding(
      'external_report_update_component',
      'Update a report component props',
      z.object({
        componentId: z.string(),
        props: z.record(z.string(), z.unknown()),
      }),
      context
        ? async (params) => {
            track('external_report_update_component')
            const parsed = z
              .object({
                componentId: z.string(),
                props: z.record(z.string(), z.unknown()),
              })
              .parse(params)
            context.onUIUpdate({
              type: 'update',
              componentId: parsed.componentId,
              props: parsed.props,
            })
            return { success: true }
          }
        : noop,
    ),
    external_report_remove_component: createBinding(
      'external_report_remove_component',
      'Remove a report component',
      z.object({
        componentId: z.string(),
      }),
      context
        ? async (params) => {
            track('external_report_remove_component')
            const parsed = z.object({ componentId: z.string() }).parse(params)
            context.onUIUpdate({
              type: 'remove',
              componentId: parsed.componentId,
            })
            return { success: true }
          }
        : noop,
    ),
    external_get_balances: createBinding(
      'external_get_balances',
      'Get account balances',
      z.object({}),
      async () => {
        track('external_get_balances')
        return getMockBalances()
      },
    ),
    external_transfer: createBinding(
      'external_transfer',
      'Transfer money between accounts',
      z.object({
        from: z.string(),
        to: z.string(),
        amount: z.number(),
      }),
      async (params) => {
        track('external_transfer')
        const parsed = z
          .object({
            from: z.string(),
            to: z.string(),
            amount: z.number(),
          })
          .parse(params)
        return performMockTransfer(parsed)
      },
    ),
    external_get_transactions: createBinding(
      'external_get_transactions',
      'Get recent transactions',
      z.object({
        limit: z.number().optional(),
      }),
      async (params) => {
        track('external_get_transactions')
        const parsed = z.object({ limit: z.number().optional() }).parse(params)
        return getMockTransactions(parsed.limit ?? 10)
      },
    ),
  }
}

// ============================================
// Mock Banking State (in-memory for demo)
// ============================================

export interface MockTransaction {
  id: string
  from: string
  to: string
  amount: number
  timestamp: number
  date: string // ISO date string for chart compatibility
  type: 'deposit' | 'withdrawal' | 'transfer'
  balance: number // Running balance after transaction
}

function createInitialTransactions(): MockTransaction[] {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  // Create some historical transactions with running balance
  return [
    {
      id: crypto.randomUUID(),
      from: 'external',
      to: 'checking',
      amount: 500,
      timestamp: now - 7 * day,
      date: new Date(now - 7 * day).toISOString(),
      type: 'deposit',
      balance: 800,
    },
    {
      id: crypto.randomUUID(),
      from: 'checking',
      to: 'savings',
      amount: 100,
      timestamp: now - 5 * day,
      date: new Date(now - 5 * day).toISOString(),
      type: 'transfer',
      balance: 700,
    },
    {
      id: crypto.randomUUID(),
      from: 'external',
      to: 'checking',
      amount: 300,
      timestamp: now - 3 * day,
      date: new Date(now - 3 * day).toISOString(),
      type: 'deposit',
      balance: 1000,
    },
  ]
}

let mockState = {
  balances: {
    checking: 1000,
    savings: 500,
  },
  transactions: createInitialTransactions(),
}

export function getMockBalances() {
  console.log('[MockBank] getMockBalances:', mockState.balances)
  return { ...mockState.balances }
}

function performMockTransfer(params: {
  from: string
  to: string
  amount: number
}) {
  const { from, to, amount } = params
  console.log('[MockBank] performMockTransfer:', { from, to, amount })
  console.log('[MockBank] Current balances:', mockState.balances)

  const fromBalance =
    mockState.balances[from as keyof typeof mockState.balances]
  if (fromBalance === undefined) {
    console.log('[MockBank] Transfer failed: Invalid source account:', from)
    return { success: false, error: `Invalid account: ${from}` }
  }

  if (fromBalance < amount) {
    console.log(
      '[MockBank] Transfer failed: Insufficient funds. Has:',
      fromBalance,
      'Needs:',
      amount,
    )
    return {
      success: false,
      error: `Insufficient funds in ${from}. Balance: $${fromBalance}, Requested: $${amount}`,
    }
  }

  mockState.balances[from as keyof typeof mockState.balances] -= amount
  mockState.balances[to as keyof typeof mockState.balances] += amount

  const now = Date.now()
  const transaction: MockTransaction = {
    id: crypto.randomUUID(),
    from,
    to,
    amount,
    timestamp: now,
    date: new Date(now).toISOString(),
    type:
      from === 'external'
        ? 'deposit'
        : to === 'external'
          ? 'withdrawal'
          : 'transfer',
    balance: mockState.balances.checking + mockState.balances.savings, // Total balance
  }
  mockState.transactions.unshift(transaction)

  console.log(
    '[MockBank] Transfer successful. New balances:',
    mockState.balances,
  )
  return {
    success: true,
    balances: { ...mockState.balances },
    newBalance: mockState.balances[to as keyof typeof mockState.balances],
    transaction,
  }
}

function getMockTransactions(limit: number) {
  console.log('[MockBank] getMockTransactions, limit:', limit)
  // Return transactions sorted chronologically (oldest first) for proper chart display
  // Take the most recent `limit` transactions, then sort by timestamp ascending
  return mockState.transactions
    .slice(0, limit)
    .sort((a, b) => a.timestamp - b.timestamp)
}

export function resetMockState() {
  console.log('[MockBank] Resetting mock state')
  mockState = {
    balances: { checking: 1000, savings: 500 },
    transactions: createInitialTransactions(),
  }
}

export function simulateDeposit(account: string, amount: number) {
  mockState.balances[account as keyof typeof mockState.balances] += amount
  const now = Date.now()
  const transaction: MockTransaction = {
    id: crypto.randomUUID(),
    from: 'external',
    to: account,
    amount,
    timestamp: now,
    date: new Date(now).toISOString(),
    type: 'deposit',
    balance: mockState.balances.checking + mockState.balances.savings,
  }
  mockState.transactions.unshift(transaction)
  return mockState.balances[account as keyof typeof mockState.balances]
}
