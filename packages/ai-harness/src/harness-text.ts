import { EventType } from '@tanstack/ai'
import { createHarnessHost } from './host'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { isHarnessDefinition } from './define'
import type { AnyHarness } from './define'
import type { HarnessHost } from './host'

export interface HarnessTextOptions {
  /** The host that runs the inner sessions. Default: a memory host. */
  host?: HarnessHost
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function lastUserText(messages: unknown): string {
  const list: ReadonlyArray<unknown> = Array.isArray(messages) ? messages : []
  const message = list.findLast(
    (entry) => isRecord(entry) && entry.role === 'user',
  )
  if (!isRecord(message)) return ''
  if (typeof message.content === 'string') return message.content
  const parts: ReadonlyArray<unknown> = Array.isArray(message.content)
    ? message.content
    : []
  return parts
    .map((part) =>
      isRecord(part) && part.type === 'text' && typeof part.content === 'string'
        ? part.content
        : '',
    )
    .join('')
}

/** Events of the inner turn that the outer chat shows as its own model output. */
const FORWARDED = new Set<string>([
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_END,
  EventType.REASONING_START,
  EventType.REASONING_MESSAGE_START,
  EventType.REASONING_MESSAGE_CONTENT,
  EventType.REASONING_MESSAGE_END,
  EventType.REASONING_END,
])

/**
 * Use a harness as the model of a `chat()` call, the way you would call a
 * coding agent. Each outer thread gets its own inner session, which keeps
 * its own transcript, tools, plugins, and agents. The outer chat sees the
 * inner turn's text and reasoning.
 *
 * @example
 * ```ts
 * const stream = chat({ adapter: harnessText(studio), messages, threadId })
 * ```
 */
/** A harness served by `createHarnessHandler` (or `runCli --serve`) on another machine. */
export interface RemoteHarness {
  /** The handler base URL, for example `http://127.0.0.1:8787`. */
  url: string
  /** The bearer token. */
  token?: string
  fetch?: typeof fetch
}

const TYPES = {
  providerOptions: {} as Record<string, unknown>,
  inputModalities: ['text'] as readonly ['text'],
  messageMetadataByModality: {
    text: undefined as unknown,
    image: undefined as unknown,
    audio: undefined as unknown,
    video: undefined as unknown,
    document: undefined as unknown,
  },
  toolCapabilities: [] as ReadonlyArray<string>,
  toolCallMetadata: undefined as unknown,
  systemPromptMetadata: undefined as never,
}

/** Stream the SSE `data:` payloads of a response. */
async function* sseData(response: Response): AsyncGenerator<unknown> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
      if (data) yield JSON.parse(data)
    }
  }
}

function remoteHarnessText(remote: RemoteHarness): AnyTextAdapter {
  const base = remote.url.replace(/\/$/, '')
  const doFetch = remote.fetch ?? fetch
  return {
    kind: 'text',
    name: 'harness-remote',
    model: base,
    '~types': TYPES,
    structuredOutput: () =>
      Promise.reject(
        new Error('harnessText does not support structured output.'),
      ),
    chatStream: (chatOptions) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        const threadId = chatOptions.threadId ?? 'default'
        const runId = chatOptions.runId ?? `harness-${Date.now().toString(36)}`
        const response = await doFetch(`${base}/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(remote.token
              ? { Authorization: `Bearer ${remote.token}` }
              : {}),
          },
          body: JSON.stringify({
            threadId,
            runId,
            // The remote session keeps its own history, so send the new message only.
            messages: [
              {
                id: `${runId}-user`,
                role: 'user',
                content: lastUserText(chatOptions.messages),
              },
            ],
            tools: [],
            context: [],
            state: {},
            forwardedProps: {},
          }),
        })
        if (!response.ok) {
          throw new Error(
            `Remote harness failed (${response.status}): ${await response.text()}`,
          )
        }
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        for await (const data of sseData(response)) {
          if (!isRecord(data) || typeof data.type !== 'string') continue
          // The handler sends AG-UI chunks over SSE.
          const chunk = data as StreamChunk
          if (
            FORWARDED.has(chunk.type) &&
            !('subagentRunId' in chunk && chunk.subagentRunId)
          ) {
            yield chunk
          }
          if (chunk.type === EventType.RUN_ERROR) {
            yield {
              type: EventType.RUN_ERROR,
              message: chunk.message,
              timestamp: Date.now(),
            }
            return
          }
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

export function harnessText(
  harness: AnyHarness,
  options?: HarnessTextOptions,
): AnyTextAdapter
export function harnessText(remote: RemoteHarness): AnyTextAdapter
export function harnessText(
  target: AnyHarness | RemoteHarness,
  options: HarnessTextOptions = {},
): AnyTextAdapter {
  if (!isHarnessDefinition(target)) return remoteHarnessText(target)
  const harness = target
  let host = options.host
  return {
    kind: 'text',
    name: 'harness',
    model: harness.name,
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    chatStream: (chatOptions) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        host ??= createHarnessHost()
        const threadId = `${chatOptions.threadId ?? 'default'}:${harness.name}`
        const runId = chatOptions.runId ?? `harness-${Date.now().toString(36)}`
        const signal =
          isRecord(chatOptions.request) &&
          chatOptions.request.signal instanceof AbortSignal
            ? chatOptions.request.signal
            : undefined
        const session = await host.open(harness, { threadId })
        const operation = session.prompt(lastUserText(chatOptions.messages))
        signal?.addEventListener('abort', () => void operation.cancel(), {
          once: true,
        })

        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          timestamp: Date.now(),
        }
        let failed: string | undefined
        for await (const chunk of operation.stream()) {
          if (
            FORWARDED.has(chunk.type) &&
            !('subagentRunId' in chunk && chunk.subagentRunId)
          ) {
            yield chunk
          }
          if (chunk.type === EventType.RUN_ERROR) failed = chunk.message
        }
        if (failed !== undefined) {
          yield {
            type: EventType.RUN_ERROR,
            message: failed,
            timestamp: Date.now(),
          }
          return
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          timestamp: Date.now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
    structuredOutput: () =>
      Promise.reject(
        new Error('harnessText does not support structured output.'),
      ),
  }
}
