import {
  StreamProcessor,
  convertMessagesToModelMessages,
  modelMessagesToUIMessages,
  subagentHostMessageId,
  wireSubagentInfo,
} from '@tanstack/ai'
import type {
  Interrupt,
  ModelMessage,
  RunAgentResumeItem,
  RunStore,
  StreamChunk,
  SubagentStatus,
  SubagentWireInfo,
  UIMessage,
} from '@tanstack/ai'
import { mergeStoredMessages } from './merge-stored'
import type { InterruptStore, MessageStore } from './types'

function withSubagentInfo(
  metadata: ModelMessage['metadata'],
  info: SubagentWireInfo,
): Record<string, unknown> {
  const source =
    metadata != null && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>)
      : {}
  const tanstack =
    source.tanstack != null && typeof source.tanstack === 'object'
      ? (source.tanstack as Record<string, unknown>)
      : {}
  return { ...source, tanstack: { ...tanstack, subagent: info } }
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
  return subagentHostMessageId(runId)
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
  // The user message before a message, as the turn it answers.
  const turnOf = (list: ReadonlyArray<ModelMessage>, index: number) =>
    list.slice(0, index).findLast((message) => message.role === 'user')?.id
  const used = new Set<number>()
  for (const previous of dropped) {
    const runId = readModelRunId(previous)
    if (runId === undefined) continue
    if (merged.some((message) => readModelRunId(message) === runId)) continue
    const previousText = messageText(previous)
    const previousTurn = turnOf(stored, stored.indexOf(previous))
    const index = merged.findIndex((message, messageIndex) => {
      if (used.has(messageIndex)) return false
      if (message.role !== 'assistant') return false
      if (readModelRunId(message) !== undefined) return false
      // No child text yet (a child waits for approval): match the first
      // assistant reply to the same user message.
      if (previousText === '') {
        return (
          previousTurn !== undefined &&
          turnOf(merged, messageIndex) === previousTurn &&
          merged[messageIndex - 1]?.role === 'user'
        )
      }
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
function childText(messages: ReadonlyArray<UIMessage>) {
  return messages
    .flatMap((message) =>
      message.role === 'assistant'
        ? message.parts.flatMap((part) =>
            part.type === 'text' && part.content.trim() !== ''
              ? [part.content.trim()]
              : [],
          )
        : [],
    )
    .join('\n\n')
}

// Nested children have their own run and transcript. Leave their cards out
// of this child's transcript, so a rebuilt card does not show them twice.
function withoutCards(messages: ReadonlyArray<UIMessage>): Array<UIMessage> {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => part.type !== 'subagent'),
  }))
}

/**
 * Card data for a stored child transcript. It rides on the first message, in
 * `metadata.tanstack.subagent`, the same shape the wire uses.
 */
export function storedSubagentInfo(
  messages: ReadonlyArray<ModelMessage>,
): SubagentWireInfo | undefined {
  // Same validation as the wire path. Malformed stored data reads as absent.
  return wireSubagentInfo(messages[0])
}

type ChildNote = {
  name: string
  /** The thread and run that feed this note now. */
  threadId: string
  runId: string
  /** Last transcript write, for the write interval. */
  savedAt: number
  /** The run that started this child. A resume keeps it. */
  parentRunId: string
  parentSubagentRunId?: string
  parentToolCallId?: string
  processor: StreamProcessor
  status: SubagentStatus
  interruptIds?: Array<string>
  error?: { message: string; code?: string }
  metadata?: Record<string, unknown>
}

export function createSubagentRunRecorder(stores: {
  messages: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  /** Minimum milliseconds between writes while a child streams. */
  intervalMs?: number
}) {
  // One recorder serves every run of a middleware instance. Notes leave the
  // map when their child or their run ends.
  const children = new Map<string, ChildNote>()
  const intervalMs = stores.intervalMs ?? 1000
  // Resume entries each run answers. Committed when the run finishes or
  // suspends. Dropped on abort.
  const answered = new Map<string, Array<RunAgentResumeItem>>()
  const parentSavedAt = new Map<string, number>()

  async function loadMessages(threadId: string) {
    return stores.messages.loadThread(threadId)
  }

  // The child and its ancestors, nearest first. Each keeps its own stream.
  function lineage(subagentRunId: string) {
    const notes: Array<ChildNote> = []
    let id: string | undefined = subagentRunId
    for (let depth = 0; id !== undefined && depth < 64; depth++) {
      const note = children.get(id)
      if (!note) break
      notes.push(note)
      id = note.parentSubagentRunId
    }
    return notes
  }

  async function saveChild(subagentRunId: string) {
    const note = children.get(subagentRunId)
    if (!note) return
    note.savedAt = Date.now()
    const info: SubagentWireInfo = {
      name: note.name,
      status: note.status,
      ...(note.parentSubagentRunId !== undefined && {
        parentSubagentRunId: note.parentSubagentRunId,
      }),
      ...(note.parentToolCallId !== undefined && {
        parentToolCallId: note.parentToolCallId,
      }),
      ...(note.interruptIds !== undefined && {
        interruptIds: note.interruptIds,
      }),
      ...(note.error !== undefined && { error: note.error }),
      ...(note.metadata !== undefined && { metadata: note.metadata }),
    }
    const transcript = convertMessagesToModelMessages(
      withoutCards(note.processor.getMessages()),
    )
    const [first, ...rest] = transcript
    const head: ModelMessage = first
      ? { ...first, metadata: withSubagentInfo(first.metadata, info) }
      : {
          id: `child:${subagentRunId}`,
          role: 'assistant',
          content: '',
          metadata: withSubagentInfo(undefined, { ...info, placeholder: true }),
        }
    await stores.messages.saveThread(childStoreId(subagentRunId), [
      head,
      ...rest,
    ])
  }

  // The parent message for a routed run holds the children's text. It exists
  // even before any child writes text, so a reload can show a waiting card.
  async function saveParent(threadId: string, runId: string) {
    const notes = [...children.values()].filter(
      (note) =>
        note.parentRunId === runId &&
        note.parentSubagentRunId === undefined &&
        note.parentToolCallId === undefined,
    )
    if (notes.length === 0) return
    const content = notes
      .map((note) => {
        const text = childText(note.processor.getMessages())
        return text === '' ? '' : `${note.name}:\n${text}`
      })
      .filter((block) => block !== '')
      .join('\n\n')
    const stored = await loadMessages(threadId)
    // A resume updates the message of the run that started the child.
    const index = stored.findIndex(
      (message) => readModelRunId(message) === runId,
    )
    const host = stored[index]
    if (host) {
      const next = [...stored]
      next[index] = { ...host, content }
      await stores.messages.saveThread(threadId, next)
      return
    }
    const assistant: ModelMessage = {
      id: assistantId(runId),
      role: 'assistant',
      content,
      metadata: { tanstack: { runId } },
    }
    await stores.messages.saveThread(threadId, [...stored, assistant])
  }

  async function startChild(
    input: { threadId: string; runId: string },
    chunk: Extract<StreamChunk, { type: 'SUBAGENT_STARTED' }>,
  ) {
    const id = chunk.subagentRunId
    const record = await stores.runs?.createOrResume({
      runId: id,
      threadId: childStoreId(id),
      startedAt: Date.now(),
      parentRunId: chunk.parentSubagentRunId ?? input.runId,
      subagentRunId: id,
      name: chunk.name,
    })
    const existing = children.get(id)
    if (existing) {
      existing.threadId = input.threadId
      existing.runId = input.runId
      existing.status = 'running'
      delete existing.interruptIds
      if (chunk.metadata !== undefined) existing.metadata = chunk.metadata
    } else {
      // A resume continues the stored transcript.
      const stored = (await loadMessages(childStoreId(id))).filter(
        (message) => storedSubagentInfo([message])?.placeholder !== true,
      )
      children.set(id, {
        name: chunk.name,
        threadId: input.threadId,
        runId: input.runId,
        savedAt: 0,
        parentRunId:
          record?.parentRunId ?? chunk.parentSubagentRunId ?? input.runId,
        ...(chunk.parentSubagentRunId !== undefined && {
          parentSubagentRunId: chunk.parentSubagentRunId,
        }),
        ...(chunk.parentToolCallId !== undefined && {
          parentToolCallId: chunk.parentToolCallId,
        }),
        ...(chunk.metadata !== undefined && { metadata: chunk.metadata }),
        processor: new StreamProcessor({
          subagentRunId: id,
          initialMessages: modelMessagesToUIMessages(stored),
        }),
        status: 'running',
      })
    }
    if (record && record.status !== 'running') {
      await stores.runs?.update(id, { status: 'running' })
    }
    // The parent child shows this one as a nested card.
    if (chunk.parentSubagentRunId !== undefined) {
      children.get(chunk.parentSubagentRunId)?.processor.processChunk(chunk)
    }
    await saveChild(id)
  }

  async function settleChild(
    chunk: Extract<
      StreamChunk,
      { type: 'SUBAGENT_FINISHED' | 'SUBAGENT_ERROR' }
    >,
  ) {
    const id = chunk.subagentRunId
    const note = children.get(id)
    if (!note) return
    try {
      await writeSettled(note, id, chunk)
    } finally {
      // A routed child stays until its run ends: the parent message reads its
      // text. Nested children and children started by a tool call go now.
      if (
        note.parentSubagentRunId !== undefined ||
        note.parentToolCallId !== undefined
      ) {
        children.delete(id)
      }
    }
  }

  async function writeSettled(
    note: ChildNote,
    id: string,
    chunk: Extract<
      StreamChunk,
      { type: 'SUBAGENT_FINISHED' | 'SUBAGENT_ERROR' }
    >,
  ) {
    note.processor.finalizeStream()
    if (note.parentSubagentRunId !== undefined) {
      children.get(note.parentSubagentRunId)?.processor.processChunk(chunk)
    }
    if (chunk.type === 'SUBAGENT_ERROR') {
      const stopped = chunk.message === 'Stopped'
      note.status = 'error'
      note.error = { message: chunk.message }
      await saveChild(id)
      await stores.runs?.update(id, {
        status: stopped ? 'aborted' : 'failed',
        finishedAt: Date.now(),
        ...(!stopped ? { error: { message: chunk.message } } : {}),
      })
      return
    }
    if (chunk.outcome?.type === 'suspended') {
      note.status = 'suspended'
      note.interruptIds = chunk.outcome.interruptIds ?? []
      await saveChild(id)
      await stores.runs?.update(id, { status: 'interrupted' })
      return
    }
    note.status = 'finished'
    await saveChild(id)
    await stores.runs?.update(id, {
      status: 'completed',
      finishedAt: Date.now(),
    })
  }

  async function commitAnswers(runId: string) {
    const entries = answered.get(runId) ?? []
    answered.delete(runId)
    for (const entry of entries) {
      if (entry.status === 'cancelled') {
        await stores.interrupts?.cancel(entry.interruptId)
      } else {
        await stores.interrupts?.resolve(entry.interruptId, entry.payload)
      }
    }
  }

  /** The notes a run fed. */
  function notesOf(runId: string) {
    return [...children].filter(([, note]) => note.runId === runId)
  }

  function forget(runId: string) {
    for (const [id] of notesOf(runId)) children.delete(id)
    parentSavedAt.delete(runId)
  }

  async function settleOpenChildren(
    runId: string,
    status: 'completed' | 'failed' | 'aborted',
    error?: { message: string },
  ) {
    for (const [subagentRunId] of notesOf(runId)) {
      await saveChild(subagentRunId)
      const current = await stores.runs?.get(subagentRunId)
      if (current && current.status !== 'running') continue
      await stores.runs?.update(subagentRunId, {
        status,
        finishedAt: Date.now(),
        ...(error ? { error } : {}),
      })
    }
  }

  /** Write the parent messages of this thread's routed children. */
  async function saveParents(threadId: string) {
    const runIds = new Set(
      [...children.values()]
        .filter((note) => note.threadId === threadId)
        .map((note) => note.parentRunId),
    )
    for (const runId of runIds) await saveParent(threadId, runId)
  }

  return {
    async start(input: {
      threadId: string
      runId: string
      messages: ReadonlyArray<UIMessage | ModelMessage>
      resume?: ReadonlyArray<RunAgentResumeItem>
    }) {
      await stores.runs?.createOrResume({
        runId: input.runId,
        threadId: input.threadId,
        startedAt: Date.now(),
      })
      if (input.resume?.length) answered.set(input.runId, [...input.resume])
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
      if (chunk.type === 'SUBAGENT_STARTED') {
        await startChild(input, chunk)
        return
      }
      if (
        chunk.type === 'SUBAGENT_FINISHED' ||
        chunk.type === 'SUBAGENT_ERROR'
      ) {
        await settleChild(chunk)
        await saveParents(input.threadId)
        return
      }
      const subagentRunId = readSubagentRunId(chunk)
      if (!subagentRunId) return
      const notes = lineage(subagentRunId)
      if (notes.length === 0) return
      for (const note of notes) note.processor.processChunk(chunk)
      // A streaming child writes at most once per interval. Its terminal
      // event and the run's end always write.
      const now = Date.now()
      const note = notes[0]
      if (note && now - note.savedAt >= intervalMs) {
        await saveChild(subagentRunId)
      }
      if (
        chunk.type === 'TEXT_MESSAGE_CONTENT' &&
        now - (parentSavedAt.get(input.runId) ?? 0) >= intervalMs
      ) {
        parentSavedAt.set(input.runId, now)
        await saveParents(input.threadId)
      }
    },

    async suspend(input: {
      threadId: string
      runId: string
      interrupts: ReadonlyArray<Interrupt>
    }) {
      await commitAnswers(input.runId)
      await saveParents(input.threadId)
      for (const [subagentRunId] of notesOf(input.runId)) {
        await saveChild(subagentRunId)
      }
      for (const interrupt of input.interrupts) {
        await stores.interrupts?.create({
          interruptId: interrupt.id,
          runId: input.runId,
          threadId: input.threadId,
          requestedAt: Date.now(),
          payload: { ...interrupt },
        })
      }
      await stores.runs?.update(input.runId, { status: 'interrupted' })
      forget(input.runId)
    },

    async finish(input: { threadId: string; runId: string }) {
      await commitAnswers(input.runId)
      await saveParents(input.threadId)
      await settleOpenChildren(input.runId, 'completed')
      await stores.runs?.update(input.runId, {
        status: 'completed',
        finishedAt: Date.now(),
      })
      forget(input.runId)
    },

    async abort(input: { threadId: string; runId: string; error?: unknown }) {
      const aborted =
        input.error instanceof Error && input.error.name === 'AbortError'
      const message =
        input.error instanceof Error ? input.error.message : 'Run failed'
      await settleOpenChildren(
        input.runId,
        aborted ? 'aborted' : 'failed',
        aborted ? undefined : { message },
      )
      await saveParents(input.threadId)
      await stores.runs?.update(input.runId, {
        status: aborted ? 'aborted' : 'failed',
        finishedAt: Date.now(),
        ...(!aborted ? { error: { message } } : {}),
      })
      answered.delete(input.runId)
      forget(input.runId)
    },
  }
}
