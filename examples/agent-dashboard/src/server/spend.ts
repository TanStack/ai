/**
 * Spend per thread, from `session.usage()`. Cost comes from the providers when
 * they report it, else from the `@tanstack/ai-models` prices. A model that is
 * not in the catalog (the scripted demo models) costs 0.
 *
 * Budgets are token limits per thread. `DEFAULT_BUDGET` only drives the spend
 * alerts. A budget that the operator sets is a hard limit: `runPrompt` refuses
 * a prompt once the thread reaches it.
 *
 * Server-only.
 */
import { getModel, modelCost } from '@tanstack/ai-models'
import { openThread } from './harness'
import { fileMap } from './store'

export const DEFAULT_BUDGET = 2000

export const budgets = fileMap<number>('budgets')

export async function spendOf(threadId: string) {
  const { session } = await openThread(threadId)
  const { total, byModel } = session.usage()
  let cost = 0
  for (const [key, counts] of Object.entries(byModel)) {
    if (counts.cost !== undefined) {
      cost += counts.cost
      continue
    }
    const slash = key.indexOf('/')
    const model = getModel(key.slice(0, slash), key.slice(slash + 1))
    if (!model) continue
    cost += modelCost(model, {
      input:
        counts.promptTokens - counts.cachedTokens - counts.cacheWriteTokens,
      output: counts.completionTokens,
      cacheRead: counts.cachedTokens,
      cacheWrite: counts.cacheWriteTokens,
    }).total
  }
  return {
    threadId,
    inputTokens: total.promptTokens,
    outputTokens: total.completionTokens,
    totalTokens: total.totalTokens,
    cost,
    budget: budgets.get(threadId) ?? DEFAULT_BUDGET,
  }
}

export async function overBudget(threadId: string): Promise<boolean> {
  if (!budgets.has(threadId)) return false
  const { totalTokens, budget } = await spendOf(threadId)
  return totalTokens >= budget
}
