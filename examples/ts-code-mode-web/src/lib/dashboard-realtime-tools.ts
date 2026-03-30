import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Client tool for OpenAI Realtime: runs server-side executePrompt against the
 * shoe catalog (same data as the home page product demo).
 */
export const executePromptShoeCatalogTool = toolDefinition({
  name: 'execute_prompt',
  description:
    'Run a code-mode analysis over the shoe product catalog. Use this whenever the user asks about shoes, prices, brands, categories, comparisons, or inventory-style questions. Pass a clear natural-language prompt describing what data to compute or retrieve.',
  inputSchema: z.object({
    prompt: z
      .string()
      .describe(
        'What to compute or look up (e.g. "average price of Nike shoes", "list all running shoes under $150")',
      ),
  }),
  outputSchema: z.object({
    data: z.unknown(),
    agentName: z.string(),
  }),
}).client(async (input) => {
  const prompt = resolveExecutePromptArg(input)
  const res = await fetch('/api/execute-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg =
      typeof errBody === 'object' && errBody !== null && 'error' in errBody
        ? String((errBody as { error?: string }).error)
        : res.statusText
    throw new Error(msg || `execute_prompt failed (${res.status})`)
  }
  return res.json() as Promise<{ data: unknown; agentName: string }>
})

export const dashboardRealtimeTools = [executePromptShoeCatalogTool] as const

function resolveExecutePromptArg(input: unknown): string {
  if (typeof input === 'string') {
    const t = input.trim()
    if (!t) {
      throw new Error(
        'execute_prompt: model sent empty arguments; use { "prompt": "..." }',
      )
    }
    try {
      const parsed = JSON.parse(t) as Record<string, unknown>
      const p = firstString(
        parsed.prompt,
        parsed.query,
        parsed.question,
        parsed.instruction,
        parsed.task,
      )
      if (p) return p
    } catch {
      /* treat whole string as the prompt */
    }
    return t
  }

  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>
    const p = firstString(
      o.prompt,
      o.query,
      o.question,
      o.instruction,
      o.task,
    )
    if (p) return p
  }

  throw new Error(
    'execute_prompt: expected a prompt string (property: prompt, query, question, instruction, or task)',
  )
}

function firstString(...candidates: Array<unknown>): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return undefined
}
