import { getLogRecords } from '@tanstack/ai'
import { PolicyResolver } from './policies'
import { projectToolCallArgs, projectToolResult } from './project'
import { createStash } from './stash'
import { optimizeRecord } from './record'
import { createRetrieveTool } from './retrieve-tool'
import type { ChatMiddleware, ModelMessage } from '@tanstack/ai'
import type { PolicyTool } from './policies'
import type { ToolResultState } from './project'
import type { Stash } from './stash'
import type { OptimizationEvent, OptimizeConfig } from './types'

function safeParse(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

/** A projection runtime: one stash, the middleware, and the retrieval tool. */
export interface ContextRuntime {
  middleware: ChatMiddleware
  retrieveTool: ReturnType<typeof createRetrieveTool>
  stash: Stash
}

/**
 * Build a projection runtime over a shared stash. `optimize()` builds one of
 * these internally; call `createContextRuntime()` directly for the
 * author-adorned path (no `optimize()` config needed).
 */
export function createContextRuntime(config: OptimizeConfig = {}): ContextRuntime {
  const resolver = new PolicyResolver(config)
  const stash = createStash()

  // Run-scoped observability. Projection re-runs identically each iteration
  // (cache honesty), so dedupe projected events by field; retrievals are
  // distinct actions and always pass through. Accumulate for the log record.
  const collected: Array<OptimizationEvent> = []
  const emittedProjections = new Set<string>()
  const emit = (e: OptimizationEvent) => {
    if (e.type === 'projected') {
      const key = `${e.toolCallId}|${e.fieldPath}`
      if (emittedProjections.has(key)) return
      emittedProjections.add(key)
    }
    collected.push(e)
    config.onEvent?.(e)
  }

  const retrieveTool = createRetrieveTool(stash, emit)

  const middleware: ChatMiddleware = {
    name: 'optimize',

    onConfig(ctx, mwConfig) {
      // init is discarded by the engine rebuild and can run before the thread
      // hydrates. Project only on model-bound phases (compaction precedent).
      if (ctx.phase === 'init') return
      const source = mwConfig.providerMessages ?? mwConfig.messages

      // Map toolCallId → toolName and collect which calls have completed.
      const nameById = new Map<string, string>()
      const completed = new Set<string>()
      for (const m of source) {
        if (m.role === 'assistant' && m.toolCalls) {
          for (const tc of m.toolCalls) nameById.set(tc.id, tc.function.name)
        }
        if (m.role === 'tool' && m.toolCallId) completed.add(m.toolCallId)
      }

      const toolByName = new Map<string, PolicyTool>()
      for (const t of mwConfig.tools ?? []) toolByName.set(t.name, t as PolicyTool)
      const toolFor = (name: string): PolicyTool => toolByName.get(name) ?? { name }

      let changed = false
      const projected = source.map((m): ModelMessage => {
        // Tool result projection.
        if (m.role === 'tool' && m.toolCallId && m.content !== null) {
          const toolName = nameById.get(m.toolCallId) ?? m.name ?? ''
          const policy = resolver.result(toolFor(toolName))
          if (!policy) return m
          const state: ToolResultState = m.error !== undefined ? 'error' : 'complete'
          const output = typeof m.content === 'string' ? safeParse(m.content) : undefined
          const { content, events } = projectToolResult({
            toolName,
            toolCallId: m.toolCallId,
            state,
            content: m.content,
            output,
            policy,
            stash,
          })
          if (events.length === 0) return m
          for (const e of events) emit(e)
          changed = true
          return { ...m, content }
        }

        // Completed tool-call argument projection (D3).
        if (m.role === 'assistant' && m.toolCalls) {
          let localChanged = false
          const toolCalls = m.toolCalls.map((tc) => {
            if (!completed.has(tc.id)) return tc
            const policy = resolver.args(toolFor(tc.function.name))
            if (!policy) return tc
            const { args, events } = projectToolCallArgs({
              toolName: tc.function.name,
              toolCallId: tc.id,
              args: safeParse(tc.function.arguments),
              policy,
              stash,
            })
            if (events.length === 0) return tc
            for (const e of events) emit(e)
            localChanged = true
            return { ...tc, function: { ...tc.function, arguments: JSON.stringify(args) } }
          })
          if (!localChanged) return m
          changed = true
          return { ...m, toolCalls }
        }

        return m
      })

      if (!changed) return
      return { providerMessages: projected }
    },

    async onFinish(ctx) {
      if (collected.length === 0) return
      const logRecords = getLogRecords(ctx, { optional: true })
      if (logRecords) await logRecords.append([optimizeRecord(collected)])
    },
  }

  return { middleware, retrieveTool, stash }
}
