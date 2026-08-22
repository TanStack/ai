import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { EventType } from '@tanstack/ai'
import { useChat } from '@tanstack/ai-react'
import type { StreamChunk } from '@tanstack/ai'
import type {
  RunAgentInputContext,
  SubscribeConnectionAdapter,
} from '@tanstack/ai-react'

export const Route = createFileRoute('/chat-client-stream-processing')({
  component: ChatClientStreamProcessingPage,
})

const CONTENT_CHUNK_COUNT = 2_000
const CHUNK_WORK_MS = 0.075

type DrainResult = {
  contentChunkCount: number
  firstContentBeforeUserBlockingTask: boolean
  longTaskObserverSupported: boolean
  longTaskCount: number
  ordered: boolean
  userBlockingTaskBeforeRunFinished: boolean
}

type TaskScheduler = {
  postTask: (
    callback: () => void,
    options: { priority: 'user-blocking' },
  ) => Promise<void>
}

declare const scheduler: TaskScheduler

function createChunks(run: RunAgentInputContext): Array<StreamChunk> {
  const messageId = 'buffered-message'
  const timestamp = Date.now()
  const chunks: Array<StreamChunk> = [
    {
      type: EventType.RUN_STARTED,
      runId: run.runId,
      threadId: run.threadId,
      timestamp,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp,
    },
  ]

  for (let index = 0; index < CONTENT_CHUNK_COUNT; index++) {
    chunks.push({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: String(index),
      timestamp,
    })
  }

  chunks.push(
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp,
    },
    {
      type: EventType.RUN_FINISHED,
      runId: run.runId,
      threadId: run.threadId,
      timestamp,
    },
  )

  return chunks
}

function createBufferedConnection(): SubscribeConnectionAdapter {
  const queue: Array<StreamChunk> = []
  let wake: (() => void) | undefined

  return {
    subscribe(signal) {
      return (async function* () {
        while (!signal?.aborted) {
          if (queue.length === 0) {
            await new Promise<void>((resolve) => {
              const onAbort = () => resolve()
              wake = () => {
                signal?.removeEventListener('abort', onAbort)
                resolve()
              }
              signal?.addEventListener('abort', onAbort, { once: true })
            })
            wake = undefined
          }

          let chunk = queue.shift()
          while (chunk !== undefined) {
            yield chunk
            chunk = queue.shift()
          }
        }
      })()
    },
    send(_messages, _data, _signal, run) {
      if (run === undefined) {
        return Promise.reject(new Error('Missing run context'))
      }
      queue.push(...createChunks(run))
      wake?.()
      return Promise.resolve()
    },
  }
}

function occupyMainThread(): void {
  const deadline = performance.now() + CHUNK_WORK_MS
  while (performance.now() < deadline) {
    // Keep each chunk cheap while making an uninterrupted drain a long task.
  }
}

function ChatClientStreamProcessingPage() {
  const connection = useMemo(createBufferedConnection, [])
  const userBlockingTaskRan = useRef(false)
  const nextContentIndex = useRef(0)
  const nextChunkIndex = useRef(0)
  const ordered = useRef(true)
  const firstContentBeforeUserBlockingTask = useRef<boolean | undefined>(
    undefined,
  )
  const userBlockingTaskBeforeRunFinished = useRef(false)
  const longTasks = useRef<Array<PerformanceEntry>>([])
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string>()
  const [hydrated, setHydrated] = useState(false)
  const [result, setResult] = useState<DrainResult>()
  const { isLoading, messages, sendMessage } = useChat({
    connection,
    onChunk(chunk) {
      occupyMainThread()

      const chunkIndex = nextChunkIndex.current++
      if (chunkIndex === 0) {
        ordered.current =
          ordered.current && chunk.type === EventType.RUN_STARTED
      } else if (chunkIndex === 1) {
        ordered.current =
          ordered.current && chunk.type === EventType.TEXT_MESSAGE_START
      } else if (chunkIndex <= CONTENT_CHUNK_COUNT + 1) {
        ordered.current =
          ordered.current && chunk.type === EventType.TEXT_MESSAGE_CONTENT
      } else if (chunkIndex === CONTENT_CHUNK_COUNT + 2) {
        ordered.current =
          ordered.current && chunk.type === EventType.TEXT_MESSAGE_END
      } else if (chunkIndex === CONTENT_CHUNK_COUNT + 3) {
        ordered.current =
          ordered.current && chunk.type === EventType.RUN_FINISHED
      } else {
        ordered.current = false
      }

      if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
        firstContentBeforeUserBlockingTask.current ??=
          !userBlockingTaskRan.current
        if (chunk.delta !== String(nextContentIndex.current)) {
          ordered.current = false
        }
        nextContentIndex.current++
      } else if (chunk.type === EventType.RUN_FINISHED) {
        userBlockingTaskBeforeRunFinished.current = userBlockingTaskRan.current
      }
    },
  })
  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')

  useEffect(() => {
    setHydrated(true)
  }, [])

  const run = async () => {
    setComplete(false)
    setError(undefined)
    setResult(undefined)
    userBlockingTaskRan.current = false
    nextContentIndex.current = 0
    nextChunkIndex.current = 0
    ordered.current = true
    firstContentBeforeUserBlockingTask.current = undefined
    userBlockingTaskBeforeRunFinished.current = false
    longTasks.current = []

    const observer = new PerformanceObserver((list) => {
      longTasks.current.push(...list.getEntries())
    })
    observer.observe({ type: 'longtask', buffered: true })
    const startedAt = performance.now()
    void scheduler.postTask(
      () => {
        userBlockingTaskRan.current = true
      },
      { priority: 'user-blocking' },
    )

    try {
      await sendMessage('Drain buffered chunks')
      const finishedAt = performance.now()
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      )
      setResult({
        contentChunkCount: nextContentIndex.current,
        firstContentBeforeUserBlockingTask:
          firstContentBeforeUserBlockingTask.current ?? false,
        longTaskObserverSupported:
          PerformanceObserver.supportedEntryTypes.includes('longtask'),
        longTaskCount: longTasks.current.filter(
          (entry) =>
            entry.startTime < finishedAt &&
            entry.startTime + entry.duration > startedAt,
        ).length,
        ordered:
          ordered.current && nextChunkIndex.current === CONTENT_CHUNK_COUNT + 4,
        userBlockingTaskBeforeRunFinished:
          userBlockingTaskBeforeRunFinished.current,
      })
    } catch (runError) {
      setError(String(runError))
    } finally {
      observer.disconnect()
      setComplete(true)
    }
  }

  return (
    <main className="p-6">
      <button
        data-testid="run"
        type="button"
        disabled={!hydrated}
        onClick={() => void run()}
      >
        Run
      </button>
      <output data-testid="loading">{String(isLoading)}</output>
      <output data-testid="complete">{String(complete)}</output>
      <output data-testid="assistant-text">{assistantText}</output>
      {result !== undefined && (
        <output data-testid="result">{JSON.stringify(result)}</output>
      )}
      {error !== undefined && <output data-testid="error">{error}</output>}
    </main>
  )
}
