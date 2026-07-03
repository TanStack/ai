import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  EventType,
  maxIterations,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { decodeCursor, withPersistence } from '@tanstack/ai-persistence'
import { createMysqlPersistence } from '@/lib/mysql-persistence'
import type { RunErrorEvent, StreamChunk } from '@tanstack/ai'
import type { RunRecord } from '@tanstack/ai-persistence'

const SYSTEM_PROMPT = `You are a concise assistant in a durable chat demo.

Streams are persisted to MySQL so the browser can refresh and resume an
in-progress response. Keep answers short enough that the streaming behavior is
easy to inspect.`

const mysqlPersistence = createMysqlPersistence()
const activeRuns = new Map<string, Promise<void>>()
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'interrupted'])
const POLL_DELAYS_MS = [100, 150, 250, 500, 750, 1000] as const

type ChatParams = Awaited<ReturnType<typeof chatParamsFromRequestBody>>

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function runError(message: string, run?: RunRecord): RunErrorEvent {
  return {
    type: EventType.RUN_ERROR,
    timestamp: Date.now(),
    message,
    ...(run ? { runId: run.runId, threadId: run.threadId } : {}),
  }
}

function isTerminal(run: RunRecord): boolean {
  return TERMINAL_STATUSES.has(run.status)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureProducer(params: ChatParams): Promise<void> {
  const runId = params.runId
  const existing = activeRuns.get(runId)
  if (existing) {
    if (!params.resume) return
    await existing.catch(() => undefined)
    const current = activeRuns.get(runId)
    if (current && current !== existing) return
    if (current === existing) activeRuns.delete(runId)
  }

  const promise = (async () => {
    const stream = chat({
      adapter: openaiText('gpt-5.5'),
      middleware: [
        withPersistence(mysqlPersistence, {
          features: ['messages', 'durable-replay', 'interrupts'],
        }),
      ],
      systemPrompts: [SYSTEM_PROMPT],
      agentLoopStrategy: maxIterations(4),
      messages: params.messages,
      threadId: params.threadId,
      runId: params.runId,
      cursor: params.cursor,
      resume: params.resume,
    })

    for await (const _chunk of stream) {
      // Drain the model stream so withPersistence writes every public event to
      // MySQL. Browser disconnects only cancel response tailing, not this run.
    }
  })()

  activeRuns.set(runId, promise)
  promise
    .catch((error) => {
      console.error('[mysql-persistent-chat] Producer failed:', error)
    })
    .finally(() => {
      if (activeRuns.get(runId) === promise) activeRuns.delete(runId)
    })
}

async function validateCursorRequest(
  params: ChatParams,
  decodedCursor: { runId: string; seq: number },
): Promise<Response | null> {
  if (decodedCursor.runId !== params.runId) {
    return jsonError('Cursor runId does not match request runId.', 409)
  }
  if (decodedCursor.seq < 1) {
    return jsonError('Cursor sequence must reference a persisted event.', 400)
  }

  const run = await mysqlPersistence.stores.runs!.get(params.runId)
  if (!run) {
    return jsonError('Run for cursor was not found.', 404)
  }
  if (run.threadId !== params.threadId) {
    return jsonError(
      'Cursor run threadId does not match request threadId.',
      409,
    )
  }

  const latestSeq = await mysqlPersistence.stores.publicEvents!.latestSeq(
    params.runId,
  )
  if (latestSeq === 0) {
    return jsonError('Run has no persisted public events.', 404)
  }
  if (latestSeq < decodedCursor.seq) {
    return jsonError('Cursor is ahead of persisted public events.', 409)
  }

  let foundCursorEvent = false
  for await (const event of mysqlPersistence.stores.publicEvents!.read(
    params.runId,
    { afterSeq: decodedCursor.seq - 1 },
  )) {
    foundCursorEvent = event.seq === decodedCursor.seq
    break
  }
  if (!foundCursorEvent) {
    return jsonError('Cursor event was not found.', 404)
  }

  if (
    run.status === 'running' &&
    !params.resume &&
    !activeRuns.has(params.runId)
  ) {
    return jsonError(
      'Run is still marked running, but no in-process producer is active. Restarting producers after a server process restart is out of scope for this example.',
      409,
    )
  }

  if (run.status === 'failed' && latestSeq <= decodedCursor.seq) {
    return jsonError(
      'Run failed and no newer persisted terminal event is available.',
      409,
    )
  }

  return null
}

async function* tailPersistedEvents(
  runId: string,
  afterSeq: number,
  signal: AbortSignal,
): AsyncIterable<StreamChunk> {
  let seq = afterSeq
  let idlePolls = 0

  while (!signal.aborted) {
    let yielded = false
    for await (const persisted of mysqlPersistence.stores.publicEvents!.read(
      runId,
      seq > 0 ? { afterSeq: seq } : undefined,
    )) {
      if (signal.aborted) return
      seq = persisted.seq
      yielded = true
      idlePolls = 0
      yield persisted.event
    }

    const run = await mysqlPersistence.stores.runs!.get(runId)
    const activeProducer = activeRuns.has(runId)
    if (!run) {
      if (activeProducer) {
        if (!yielded) {
          const delayMs =
            POLL_DELAYS_MS[Math.min(idlePolls, POLL_DELAYS_MS.length - 1)]
          idlePolls += 1
          await delay(delayMs)
        }
        continue
      }
      yield runError('Run disappeared while tailing persisted events.')
      return
    }

    if (run.status === 'running' && !activeProducer) {
      yield runError(
        'Run is still marked running, but no in-process producer is active. Restarting producers after a server process restart is out of scope for this example.',
        run,
      )
      return
    }

    if (isTerminal(run) && !activeProducer) {
      const latestSeq =
        await mysqlPersistence.stores.publicEvents!.latestSeq(runId)
      if (latestSeq <= seq) {
        if (run.status === 'failed' && !yielded) {
          yield runError(
            run.error ||
              'Run failed before any newer terminal event was available.',
            run,
          )
        }
        return
      }
    }

    if (!yielded) {
      const delayMs =
        POLL_DELAYS_MS[Math.min(idlePolls, POLL_DELAYS_MS.length - 1)]
      idlePolls += 1
      await delay(delayMs)
    }
  }
}

export const Route = createFileRoute('/api/mysql-persistent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        try {
          let decodedCursor: { runId: string; seq: number } | undefined
          if (params.cursor) {
            try {
              decodedCursor = decodeCursor(params.cursor)
            } catch {
              return jsonError('Invalid cursor.', 400)
            }
            const invalidCursorResponse = await validateCursorRequest(
              params,
              decodedCursor,
            )
            if (invalidCursorResponse) return invalidCursorResponse
          }
          const runId = decodedCursor?.runId ?? params.runId
          const afterSeq = decodedCursor?.seq ?? 0

          if (!params.cursor || params.resume) {
            await ensureProducer(params)
          } else {
            const run = await mysqlPersistence.stores.runs!.get(runId)
            if (!run) return jsonError('Run was not found.', 404)
          }

          const responseAbortController = new AbortController()
          request.signal.addEventListener(
            'abort',
            () => responseAbortController.abort(),
            { once: true },
          )

          return toServerSentEventsResponse(
            tailPersistedEvents(
              runId,
              afterSeq,
              responseAbortController.signal,
            ),
            { abortController: responseAbortController },
          )
        } catch (error) {
          console.error('[mysql-persistent-chat] Chat request failed:', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
