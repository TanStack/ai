import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  InterruptResumeValidationError,
  withChatPersistence,
} from '@tanstack/ai-persistence'
import { createFileRoute } from '@tanstack/react-router'
import {
  createInterruptFixtureAdapter,
  fixtureResumeMessages,
  getInterruptFixture,
  interruptFixtureServerTools,
  responseDecision,
} from '../lib/interrupts-v2-fixture'
import type { RunAgentResumeItem, StreamChunk } from '@tanstack/ai'
import type { InterruptFixture } from '../lib/interrupts-v2-fixture'

async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function replayChunks(
  chunks: ReadonlyArray<StreamChunk>,
): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve()
      for (const chunk of chunks) yield chunk
    },
  }
}

function truncatedSseResponse(): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: RUN_STARTED\ndata: {'))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

function errorStream(
  error: InterruptResumeValidationError,
  runId: string,
): AsyncIterable<StreamChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      await Promise.resolve()
      const base: StreamChunk = {
        type: EventType.RUN_ERROR,
        runId,
        message: error.message,
        code: 'INTERRUPT_RESUME_VALIDATION',
        timestamp: Date.now(),
      }
      yield Object.assign(base, {
        'tanstack:interruptErrors': error.errors,
        ...(error.recovery === undefined
          ? {}
          : { 'tanstack:interruptRecovery': error.recovery }),
      })
    },
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined
}

function recordSubmission(
  fixture: InterruptFixture,
  resume: ReadonlyArray<RunAgentResumeItem>,
  chunks: ReadonlyArray<StreamChunk>,
  runId: string,
): void {
  fixture.continuationCount += 1
  fixture.continuationRunIds.push(runId)
  fixture.continuationChunks.set(runId, chunks)
  fixture.decisions = resume.map(responseDecision)
  fixture.auditHistory = resume.map(
    (item) => `${item.interruptId}:${responseDecision(item)}`,
  )
  fixture.resultEventNames = chunks
    .map((chunk) => chunk.type)
    .filter(
      (type) =>
        type === EventType.RUN_STARTED ||
        type === EventType.TOOL_CALL_RESULT ||
        type === EventType.RUN_FINISHED,
    )
  fixture.storedHistory.push(fixture.decisions.join(','))

  for (const item of resume) {
    const payload = objectValue(item.payload)
    const editedArgs = payload?.editedArgs
    const edited = objectValue(editedArgs)
    if (edited) fixture.edits = edited
  }
}

function replayedContinuationId(
  chunks: ReadonlyArray<StreamChunk>,
): string | undefined {
  for (const chunk of chunks) {
    if (chunk.type !== EventType.RUN_FINISHED || !('result' in chunk)) continue
    const result = objectValue(chunk.result)
    if (result?.replayed !== true) continue
    const continuationRunId = result.continuationRunId
    if (typeof continuationRunId === 'string') return continuationRunId
  }
  return undefined
}

function hasInterruptFailure(chunks: ReadonlyArray<StreamChunk>): boolean {
  return chunks.some(
    (chunk) =>
      chunk.type === EventType.RUN_ERROR &&
      (chunk['tanstack:interruptErrors']?.length ?? 0) > 0,
  )
}

export const Route = createFileRoute('/api/interrupts-v2')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId')
        if (!testId) return new Response('Missing testId', { status: 400 })
        const fixture = getInterruptFixture(testId)

        if (url.searchParams.get('stats') === '1') {
          return Response.json({
            continuationCount: fixture.continuationCount,
            continuationRunIds: fixture.continuationRunIds,
            decisions: fixture.decisions,
            edits: fixture.edits,
            auditHistory: fixture.auditHistory,
            resultEventNames: fixture.resultEventNames,
            storedHistory: fixture.storedHistory,
            truncatedResponses: fixture.truncatedResponses,
            replayCount: fixture.replayCount,
            joinedContinuationRunId: fixture.joinedContinuationRunId,
          })
        }

        const runId = url.searchParams.get('runId')
        if (!runId) return new Response('Missing runId', { status: 400 })
        const chunks = fixture.continuationChunks.get(runId)
        if (!chunks) return new Response('Unknown run', { status: 404 })
        fixture.replayCount += 1
        fixture.joinedContinuationRunId = runId
        return toServerSentEventsResponse(replayChunks(chunks))
      },
      POST: async ({ request }) => {
        const url = new URL(request.url)
        const testId = url.searchParams.get('testId')
        const scenario = url.searchParams.get('scenario')
        if (!testId || !scenario) {
          return new Response('Missing fixture correlation', { status: 400 })
        }

        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const fixture = getInterruptFixture(testId)
        const resumeMessages =
          params.resume === undefined
            ? undefined
            : fixtureResumeMessages(scenario)
        const stream = chat({
          ...params,
          ...(resumeMessages === undefined ? {} : { messages: resumeMessages }),
          adapter: createInterruptFixtureAdapter(
            scenario,
            params.resume !== undefined,
          ),
          tools: [...interruptFixtureServerTools],
          middleware: [withChatPersistence(fixture.persistence)],
        })

        let chunks: Array<StreamChunk>
        try {
          chunks = await collectChunks(stream)
        } catch (error) {
          if (error instanceof InterruptResumeValidationError) {
            return toServerSentEventsResponse(errorStream(error, params.runId))
          }
          throw error
        }

        if (params.resume !== undefined) {
          const replayedId = replayedContinuationId(chunks)
          if (replayedId === undefined && !hasInterruptFailure(chunks)) {
            recordSubmission(fixture, params.resume, chunks, params.runId)
          } else {
            fixture.joinedContinuationRunId = replayedId
          }
        }

        if (
          scenario === 'commit-then-truncate' &&
          params.resume !== undefined &&
          fixture.truncateCommittedResponseOnce
        ) {
          fixture.truncateCommittedResponseOnce = false
          fixture.truncatedResponses += 1
          return truncatedSseResponse()
        }

        return toServerSentEventsResponse(replayChunks(chunks))
      },
    },
  },
})
