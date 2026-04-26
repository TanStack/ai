import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export interface CodeExecution {
  typescriptCode: string
  success: boolean
  result?: unknown
  logs?: Array<string>
  error?: { message: string; name?: string }
}

export interface ExecutePromptLogEntry {
  id: string
  timestamp: number
  phase: 'request' | 'response' | 'error'
  prompt: string
  durationMs?: number
  status?: number
  data?: unknown
  error?: string
  executions?: Array<CodeExecution>
}

type LogListener = (entry: ExecutePromptLogEntry) => void

let listeners: Array<LogListener> = []

export function onExecutePromptLog(fn: LogListener): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

function emit(entry: ExecutePromptLogEntry) {
  for (const fn of listeners) fn(entry)
}

let logSeq = 0
function nextId() {
  return `ep-${++logSeq}-${Date.now()}`
}

/** Client tool calling POST /api/execute-prompt; server uses local createExecutePromptTool (see lib/create-execute-prompt-tool.ts). */
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
  }),
}).client(async (input) => {
  const prompt = resolveExecutePromptArg(input)
  const id = nextId()
  const startMs = Date.now()

  emit({ id, timestamp: startMs, phase: 'request', prompt })

  const res = await fetch('/api/execute-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })

  const durationMs = Date.now() - startMs

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const msg =
      typeof errBody === 'object' && errBody !== null && 'error' in errBody
        ? String((errBody as { error?: string }).error)
        : res.statusText
    const errorStr = msg || `execute_prompt failed (${res.status})`

    emit({
      id,
      timestamp: Date.now(),
      phase: 'error',
      prompt,
      durationMs,
      status: res.status,
      error: errorStr,
    })

    throw new Error(errorStr)
  }

  const result = (await res.json()) as {
    data: unknown
    executions?: Array<CodeExecution>
  }

  emit({
    id,
    timestamp: Date.now(),
    phase: 'response',
    prompt,
    durationMs,
    status: res.status,
    data: result.data,
    executions: result.executions,
  })

  return { data: result.data }
})

export const executePromptRealtimeTools = [
  executePromptShoeCatalogTool,
] as const

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
    const p = firstString(o.prompt, o.query, o.question, o.instruction, o.task)
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
