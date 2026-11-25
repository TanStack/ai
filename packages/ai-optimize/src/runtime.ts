import { createCapability, getLogRecords } from '@tanstack/ai'
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

/** The tool output behind a tool message's string content. chat() marks a
 *  result whose tool returned a string with `toolResultKind: 'text'`; that
 *  content is text, even when it looks like JSON (a `.json` file, `'42'`). */
function toolOutput(m: ModelMessage): unknown {
  if (typeof m.content !== 'string') return undefined
  if (m.metadata?.tanstack?.toolResultKind === 'text') return m.content
  return safeParse(m.content)
}

/** The state of one run: its stash and its events. */
interface RunState {
  stash: Stash
  collected: Array<OptimizationEvent>
  emittedProjections: Set<string>
}

/** A projection runtime: the middleware and the retrieval tool. */
export interface ContextRuntime {
  middleware: ChatMiddleware
  retrieveTool: ReturnType<typeof createRetrieveTool>
}

/**
 * Build a projection runtime. `optimize()` builds one of these internally;
 * call `createContextRuntime()` directly for the author-optimized path (no
 * `optimize()` config needed).
 *
 * One runtime is safe to share across requests: each `chat()` run keeps its
 * own stash and events, so concurrent runs never see or clear each other's
 * originals.
 */
export function createContextRuntime(
  config: OptimizeConfig = {},
): ContextRuntime {
  const resolver = new PolicyResolver(config)

  // Run state lives in a capability: chat() keys it on the run's context,
  // and gives tools of the same run `getOptional`, so retrieve_context reads
  // the stash of its own run.
  const runCapability = createCapability<RunState>()('tanstack.optimize.run')
  const [getRun, provideRun] = runCapability

  // Projection re-runs identically each iteration (cache honesty), so dedupe
  // projected events by field; retrievals are distinct actions and always
  // pass through. Accumulate for the log record.
  const emit = (run: RunState, e: OptimizationEvent) => {
    if (e.type === 'projected') {
      // Keyed by origin too, so an args projection and a result projection on
      // the same field path of the same call are both recorded.
      const key = `${e.origin}|${e.toolCallId}|${e.fieldPath}`
      if (run.emittedProjections.has(key)) return
      run.emittedProjections.add(key)
    }
    run.collected.push(e)
    config.onEvent?.(e)
  }

  const retrieveTool = createRetrieveTool((context) => {
    const run = context?.getOptional?.(runCapability)
    return run && { stash: run.stash, onEvent: (e) => emit(run, e) }
  })

  const middleware: ChatMiddleware = {
    name: 'optimize',
    provides: [runCapability],

    setup(ctx) {
      provideRun(ctx, {
        stash: createStash(),
        collected: [],
        emittedProjections: new Set(),
      })
    },

    onConfig(ctx, mwConfig) {
      // init is discarded by the engine rebuild and can run before the thread
      // hydrates. Project only on model-bound phases (compaction precedent).
      if (ctx.phase === 'init') return
      const run = getRun(ctx)
      const { stash } = run
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
      for (const t of mwConfig.tools ?? [])
        toolByName.set(t.name, t as PolicyTool)
      const toolFor = (name: string): PolicyTool =>
        toolByName.get(name) ?? { name }

      let changed = false
      const projected = source.map((m): ModelMessage => {
        // Tool result projection.
        if (m.role === 'tool' && m.toolCallId && m.content !== null) {
          const toolName = nameById.get(m.toolCallId) ?? m.name ?? ''
          const policy = resolver.result(toolFor(toolName))
          if (!policy) return m
          const state: ToolResultState =
            m.error !== undefined ? 'error' : 'complete'
          const output = toolOutput(m)
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
          for (const e of events) emit(run, e)
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
            for (const e of events) emit(run, e)
            localChanged = true
            return {
              ...tc,
              function: { ...tc.function, arguments: JSON.stringify(args) },
            }
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
      const run = getRun(ctx, { optional: true })
      if (!run || run.collected.length === 0) return
      const logRecords = getLogRecords(ctx, { optional: true })
      if (logRecords) await logRecords.append([optimizeRecord(run.collected)])
    },
  }

  return { middleware, retrieveTool }
}
