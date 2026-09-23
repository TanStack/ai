import { convertMessagesToModelMessages } from '@tanstack/ai'
import type {
  ModelMessage,
  RunStore,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'
import { mergeStoredMessages } from './merge-stored'
import type { MessageStore } from './types'

type ChildNote = {
  name: string
  text: string
  parentRunId: string
}

function childStoreId(subagentRunId: string) {
  return `subagent:${subagentRunId}`
}

function readSubagentRunId(chunk: StreamChunk) {
  if (!('subagentRunId' in chunk)) return
  const id = chunk.subagentRunId
  return typeof id === 'string' && id !== '' ? id : undefined
}

function assistantId(runId: string) {
  return `assistant:${runId}`
}

function messageText(message: ModelMessage) {
  return typeof message.content === 'string' ? message.content : ''
}

function readModelRunId(message: ModelMessage) {
  const metadata = message.metadata
  if (metadata == null || typeof metadata !== 'object') return
  if (!('tanstack' in metadata)) return
  const tanstack = metadata.tanstack
  if (tanstack == null || typeof tanstack !== 'object') return
  if (!('runId' in tanstack)) return
  const runId = tanstack.runId
  return typeof runId === 'string' && runId !== '' ? runId : undefined
}

function withRunId(message: ModelMessage, runId: string): ModelMessage {
  const metadata = message.metadata
  const tanstack =
    metadata != null &&
    typeof metadata === 'object' &&
    'tanstack' in metadata &&
    metadata.tanstack != null &&
    typeof metadata.tanstack === 'object'
      ? metadata.tanstack
      : {}
  return {
    ...message,
    metadata: {
      ...metadata,
      tanstack: { ...tanstack, runId },
    },
  }
}

function sameChildText(stored: string, incoming: string) {
  if (stored === '' || incoming === '') return false
  if (stored === incoming) return true
  const blocks = stored.split('\n\n').filter((block) => block.includes(':\n'))
  if (blocks.length === 0) return false
  return blocks.every((block) => incoming.includes(block))
}

// A live client mints its own assistant id. The stored row uses
// `assistant:${runId}`. When the client sends the turn again, copy `runId`
// onto the new row so the cards still rebuild.
function keepSubagentRunIds(
  stored: ReadonlyArray<ModelMessage>,
  merged: Array<ModelMessage>,
) {
  const dropped = stored.filter((message) => {
    const runId = readModelRunId(message)
    if (runId === undefined) return false
    return !merged.some(
      (item) => item.id !== undefined && item.id === message.id,
    )
  })
  const used = new Set<number>()
  for (const previous of dropped) {
    const runId = readModelRunId(previous)
    if (runId === undefined) continue
    if (merged.some((message) => readModelRunId(message) === runId)) continue
    const previousText = messageText(previous)
    const index = merged.findIndex((message, messageIndex) => {
      if (used.has(messageIndex)) return false
      if (message.role !== 'assistant') return false
      if (readModelRunId(message) !== undefined) return false
      return sameChildText(previousText, messageText(message))
    })
    if (index === -1) continue
    const host = merged[index]
    if (!host) continue
    used.add(index)
    merged[index] = withRunId(host, runId)
  }
  return merged
}

export function createSubagentRunRecorder(stores: {
  messages: MessageStore
  runs?: RunStore
}) {
  const children = new Map<string, ChildNote>()

  async function loadMessages(threadId: string) {
    return stores.messages.loadThread(threadId)
  }

  async function saveChild(subagentRunId: string) {
    const note = children.get(subagentRunId)
    if (!note) return
    await stores.messages.saveThread(childStoreId(subagentRunId), [
      {
        id: `child:${subagentRunId}`,
        role: 'assistant',
        content: note.text,
      },
    ])
  }

  async function saveParent(threadId: string, runId: string) {
    const blocks = [...children.values()]
      .filter((note) => note.parentRunId === runId)
      .map((note) => {
        const text = note.text.trim()
        return text === '' ? '' : `${note.name}:\n${text}`
      })
      .filter((block) => block !== '')
    if (blocks.length === 0) return
    const stored = await loadMessages(threadId)
    const id = assistantId(runId)
    const assistant: ModelMessage = {
      id,
      role: 'assistant',
      content: blocks.join('\n\n'),
      metadata: { tanstack: { runId } },
    }
    const without = stored.filter((message) => message.id !== id)
    await stores.messages.saveThread(threadId, [...without, assistant])
  }

  return {
    async start(input: {
      threadId: string
      runId: string
      messages: ReadonlyArray<UIMessage | ModelMessage>
    }) {
      await stores.runs?.createOrResume({
        runId: input.runId,
        threadId: input.threadId,
        startedAt: Date.now(),
      })
      const incoming = convertMessagesToModelMessages([...input.messages])
      const stored = await loadMessages(input.threadId)
      const merged = mergeStoredMessages(stored, incoming)
      await stores.messages.saveThread(
        input.threadId,
        keepSubagentRunIds(stored, merged),
      )
    },

    async chunk(input: {
      threadId: string
      runId: string
      chunk: StreamChunk
    }) {
      const chunk = input.chunk
      const subagentRunId = readSubagentRunId(chunk)
      if (chunk.type === 'SUBAGENT_STARTED' && subagentRunId) {
        const name =
          'name' in chunk && typeof chunk.name === 'string'
            ? chunk.name
            : 'subagent'
        children.set(subagentRunId, {
          name,
          text: '',
          parentRunId: input.runId,
        })
        await stores.runs?.createOrResume({
          runId: subagentRunId,
          threadId: childStoreId(subagentRunId),
          startedAt: Date.now(),
          parentRunId: input.runId,
          subagentRunId,
          name,
        })
        return
      }
      if (
        chunk.type === 'TEXT_MESSAGE_CONTENT' &&
        subagentRunId &&
        typeof chunk.delta === 'string'
      ) {
        const note = children.get(subagentRunId)
        if (!note) return
        note.text += chunk.delta
        await saveChild(subagentRunId)
        await saveParent(input.threadId, input.runId)
        return
      }
      if (
        (chunk.type === 'SUBAGENT_FINISHED' ||
          chunk.type === 'SUBAGENT_ERROR') &&
        subagentRunId
      ) {
        await saveChild(subagentRunId)
        await stores.runs?.update(subagentRunId, {
          status: chunk.type === 'SUBAGENT_ERROR' ? 'failed' : 'completed',
          finishedAt: Date.now(),
          ...(chunk.type === 'SUBAGENT_ERROR' && 'message' in chunk
            ? {
                error: {
                  message:
                    typeof chunk.message === 'string'
                      ? chunk.message
                      : 'Subagent failed',
                },
              }
            : {}),
        })
      }
    },

    async finish(input: { threadId: string; runId: string }) {
      await saveParent(input.threadId, input.runId)
      for (const [subagentRunId, note] of children) {
        if (note.parentRunId !== input.runId) continue
        await saveChild(subagentRunId)
        const current = await stores.runs?.get(subagentRunId)
        if (current && current.status !== 'running') continue
        await stores.runs?.update(subagentRunId, {
          status: 'completed',
          finishedAt: Date.now(),
        })
      }
      await stores.runs?.update(input.runId, {
        status: 'completed',
        finishedAt: Date.now(),
      })
    },

    async abort(input: { threadId: string; runId: string; error?: unknown }) {
      const aborted =
        input.error instanceof Error && input.error.name === 'AbortError'
      const message =
        input.error instanceof Error ? input.error.message : 'Run failed'
      for (const [subagentRunId, note] of children) {
        if (note.parentRunId !== input.runId) continue
        await saveChild(subagentRunId)
        const current = await stores.runs?.get(subagentRunId)
        if (current && current.status !== 'running') continue
        await stores.runs?.update(subagentRunId, {
          status: aborted ? 'aborted' : 'failed',
          finishedAt: Date.now(),
          ...(!aborted ? { error: { message } } : {}),
        })
      }
      await saveParent(input.threadId, input.runId)
      await stores.runs?.update(input.runId, {
        status: aborted ? 'aborted' : 'failed',
        finishedAt: Date.now(),
        ...(!aborted ? { error: { message } } : {}),
      })
    },
  }
}
