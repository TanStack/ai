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
import type { InterruptStore, MessageStore, SessionIndexStore } from './types'

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

/**
 * Head metadata key for what a later call of the child needs:
 * - `base`: how many stored messages came before the current call. A resume
 *   of that call keeps the number.
 * - `parentThreadId`: the thread that started the child. Only that thread can
 *   continue it.
 * - `prompt`: the task of the first call, the first user message of the child.
 */
const CHILD_KEY = 'tanstack:subagentChild'

function storedMarker(messages: ReadonlyArray<ModelMessage>) {
  const marker: unknown = messages[0]?.metadata?.[CHILD_KEY]
  const read = (key: string) =>
    marker !== null && typeof marker === 'object'
      ? Reflect.get(marker, key)
      : undefined
  const base = read('base')
  const parentThreadId = read('parentThreadId')
  const prompt = read('prompt')
  return {
    ...(typeof base === 'number' && { base }),
    ...(typeof parentThreadId === 'string' && { parentThreadId }),
    ...(typeof prompt === 'string' && { prompt }),
  }
}

/** The thread a chat writes its children under: its own child thread, if any. */
function ownerThread(caller: { threadId: string; subagentRunId?: string }) {
  return caller.subagentRunId === undefined
    ? caller.threadId
    : childStoreId(caller.subagentRunId)
}

// ponytail: only the `subagent` tool has `prompt` and `input` fields. Core does
// not export its name.
const SINGLE_TOOL = 'subagent'

/**
 * The task of a child that a tool call started: the `prompt` of the `subagent`
 * tool, else its `input` as JSON. Other tools pass their whole arguments.
 */
function callPrompt(call: { name: string; args: string }) {
  if (call.args === '') return undefined
  if (call.name !== SINGLE_TOOL) return call.args
  let args: unknown
  try {
    args = JSON.parse(call.args)
  } catch {
    return call.args
  }
  if (args === null || typeof args !== 'object') return call.args
  const prompt = Reflect.get(args, 'prompt')
  if (typeof prompt === 'string') return prompt
  const input = Reflect.get(args, 'input')
  return input === undefined ? call.args : JSON.stringify(input)
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

export function subagentHostRunId(metadata: unknown) {
  if (
    metadata === null ||
    typeof metadata !== 'object' ||
    !Object.hasOwn(metadata, 'tanstack:subagentHost')
  )
    return
  const marker = Reflect.get(metadata, 'tanstack:subagentHost')
  if (marker === null || typeof marker !== 'object' || Array.isArray(marker))
    return
  if (
    Object.keys(marker).length !== 2 ||
    !Object.hasOwn(marker, 'version') ||
    !Object.hasOwn(marker, 'runId')
  )
    return
  const runId = Reflect.get(marker, 'runId')
  return Reflect.get(marker, 'version') === 1 &&
    typeof runId === 'string' &&
    runId !== ''
    ? runId
    : undefined
}

function hasHostMarker(metadata: unknown) {
  return (
    metadata !== null &&
    typeof metadata === 'object' &&
    Object.hasOwn(metadata, 'tanstack:subagentHost')
  )
}

function hostScopeMatches(metadata: unknown, runId: string) {
  const generic = readModelRunIdFromMetadata(metadata)
  return (
    (generic === undefined || generic === runId) &&
    (!hasHostMarker(metadata) || subagentHostRunId(metadata) === runId)
  )
}

function precedingUserId<T extends { id?: string; role: string }>(
  messages: ReadonlyArray<T>,
  index: number,
) {
  return messages.slice(0, index).findLast((message) => message.role === 'user')
    ?.id
}

export function selectSubagentHost<
  T extends { id?: string; role: string; metadata?: unknown },
>(
  messages: ReadonlyArray<T>,
  runId: string,
  text: (message: T) => string,
  summaries: ReadonlyArray<string>,
): number {
  const marked = messages.flatMap((message, index) =>
    message.role === 'assistant' &&
    hostScopeMatches(message.metadata, runId) &&
    subagentHostRunId(message.metadata) === runId
      ? [index]
      : [],
  )
  if (marked.length === 1) return marked[0] ?? -1
  if (marked.length > 1) return -1
  const scoped = messages.flatMap((message, index) =>
    message.role === 'assistant' &&
    readModelRunIdFromMetadata(message.metadata) === runId
      ? [index]
      : [],
  )
  const segments = new Set(
    scoped.map((index) => precedingUserId(messages, index)),
  )
  if (segments.size !== 1 || segments.has(undefined)) return -1
  const legacy = scoped.filter((index) => {
    const message = messages[index]
    if (
      !message ||
      hasHostMarker(message.metadata) ||
      !hostScopeMatches(message.metadata, runId)
    )
      return false
    return summaries.some(
      (summary) => summary !== '' && text(message) === summary,
    )
  })
  if (legacy.length !== 1) return -1
  const index = legacy[0]
  if (index === undefined) return -1
  const candidate = messages[index]
  if (!candidate) return -1
  const hasIndependentAnchor =
    candidate.id === assistantId(runId) ||
    scoped.some((other) => other !== index)
  return hasIndependentAnchor ? index : -1
}

function unusedHostId(messages: ReadonlyArray<ModelMessage>, runId: string) {
  const base = assistantId(runId)
  let id = base
  for (
    let attempt = 1;
    messages.some((message) => message.id === id);
    attempt++
  )
    id = base + ':' + attempt
  return id
}

function readModelRunIdFromMetadata(metadata: unknown) {
  if (metadata === null || typeof metadata !== 'object') return
  const tanstack = Reflect.get(metadata, 'tanstack')
  if (tanstack === null || typeof tanstack !== 'object') return
  const runId = Reflect.get(tanstack, 'runId')
  return typeof runId === 'string' && runId !== '' ? runId : undefined
}

function withHost(message: ModelMessage, runId: string): ModelMessage {
  const next = withRunId(message, runId)
  return {
    ...next,
    metadata: {
      ...next.metadata,
      'tanstack:subagentHost': { version: 1, runId },
    },
  }
}

function keepSubagentRunIds(
  stored: ReadonlyArray<ModelMessage>,
  merged: Array<ModelMessage>,
  summariesByRun: ReadonlyMap<string, ReadonlyArray<string>>,
) {
  const runIds = new Set(
    stored.flatMap((message) => {
      const runId =
        subagentHostRunId(message.metadata) ?? readModelRunId(message)
      return runId === undefined ? [] : [runId]
    }),
  )
  for (const runId of runIds) {
    const summaries = summariesByRun.get(runId) ?? []
    const previousIndex = selectSubagentHost(
      stored,
      runId,
      messageText,
      summaries,
    )
    const previous = stored[previousIndex]
    if (!previous || merged.some((message) => message.id === previous.id))
      continue
    if (selectSubagentHost(merged, runId, messageText, summaries) !== -1)
      continue
    const turn = precedingUserId(stored, previousIndex)
    if (turn === undefined) continue
    const forms = new Set([messageText(previous), ...summaries])
    const candidates = merged.flatMap((message, index) =>
      message.role === 'assistant' &&
      hostScopeMatches(message.metadata, runId) &&
      precedingUserId(merged, index) === turn &&
      forms.has(messageText(message))
        ? [index]
        : [],
    )
    if (candidates.length !== 1) continue
    const index = candidates[0]
    if (index !== undefined && merged[index])
      merged[index] = withHost(merged[index], runId)
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

/** A stored child transcript without its card-only placeholder. */
function withoutPlaceholder(messages: ReadonlyArray<ModelMessage>) {
  return messages.filter(
    (message) => storedSubagentInfo([message])?.placeholder !== true,
  )
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
  /** Stored messages from before the current call. A resume keeps it. */
  base: number
  /** The thread that started this child. */
  parentThreadId: string
  /** The task of the first call. */
  prompt?: string
}

export function createSubagentRunRecorder(stores: {
  messages: MessageStore
  runs?: RunStore
  interrupts?: InterruptStore
  /** When present, each child gets a session index entry. */
  sessions?: SessionIndexStore
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
  // Name and arguments of each open tool call, by id. A child that a call
  // starts reads its task from here. ponytail: a call that never gets a result
  // or a child stays here, add a run-end sweep if that grows.
  const calls = new Map<string, { name: string; args: string }>()

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
    const marker = {
      [CHILD_KEY]: {
        base: note.base,
        parentThreadId: note.parentThreadId,
        ...(note.prompt !== undefined && { prompt: note.prompt }),
      },
    }
    const [first, ...rest] = transcript
    const head: ModelMessage = first
      ? {
          ...first,
          metadata: { ...withSubagentInfo(first.metadata, info), ...marker },
        }
      : {
          id: `child:${subagentRunId}`,
          role: 'assistant',
          content: '',
          metadata: {
            ...withSubagentInfo(undefined, { ...info, placeholder: true }),
            ...marker,
          },
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
    const index = selectSubagentHost(stored, runId, messageText, [
      content,
      notes
        .map((note) => childText(note.processor.getMessages()))
        .filter(Boolean)
        .join('\n\n'),
    ])
    const host = stored[index]
    if (host) {
      const otherMessages = stored.filter((_, position) => position !== index)
      const id =
        host.id != null &&
        !otherMessages.some((message) => message.id === host.id)
          ? host.id
          : unusedHostId(otherMessages, runId)
      const next = [...stored]
      next[index] = withHost({ ...host, id, content }, runId)
      await stores.messages.saveThread(threadId, next)
      return
    }
    const assistant: ModelMessage = {
      id: unusedHostId(stored, runId),
      role: 'assistant',
      content,
      metadata: {
        tanstack: { runId },
        'tanstack:subagentHost': { version: 1, runId },
      },
    }
    await stores.messages.saveThread(threadId, [...stored, assistant])
  }

  async function startChild(
    input: { threadId: string; runId: string; subagentRunId?: string },
    chunk: Extract<StreamChunk, { type: 'SUBAGENT_STARTED' }>,
  ) {
    const id = chunk.subagentRunId
    const call =
      chunk.parentToolCallId === undefined
        ? undefined
        : calls.get(chunk.parentToolCallId)
    if (chunk.parentToolCallId !== undefined) {
      calls.delete(chunk.parentToolCallId)
    }
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
      // A resume or a continue goes on from the stored transcript.
      const raw = await loadMessages(childStoreId(id))
      const stored = withoutPlaceholder(raw)
      const marker = storedMarker(raw)
      // A resume keeps the base of the call it resumes. A new call starts
      // after the whole stored transcript.
      const resumes = storedSubagentInfo(raw)?.status === 'suspended'
      // Only the first call gives the prompt. A later call keeps it.
      const prompt = raw.length > 0 ? marker.prompt : call && callPrompt(call)
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
        base: resumes ? (marker.base ?? 0) : stored.length,
        // A nested child belongs to the thread of the child that started it.
        parentThreadId: ownerThread({
          threadId: input.threadId,
          subagentRunId: chunk.parentSubagentRunId ?? input.subagentRunId,
        }),
        ...(prompt !== undefined && { prompt }),
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
    const note = children.get(id)
    if (stores.sessions && note) await indexChild(stores.sessions, id, note)
  }

  // One index entry per child. `upsert` replaces the whole entry, so keep the
  // fields that other writers set, like a title. The child has the owner and
  // the harness of its parent thread, so a list filtered by them shows it.
  async function indexChild(
    sessions: SessionIndexStore,
    subagentRunId: string,
    note: ChildNote,
  ) {
    const childThreadId = childStoreId(subagentRunId)
    const current = await sessions.get(childThreadId)
    const parent = await sessions.get(note.parentThreadId)
    const now = Date.now()
    await sessions.upsert({
      ...current,
      threadId: childThreadId,
      parentThreadId: note.parentThreadId,
      ...(note.parentToolCallId !== undefined && {
        parentToolCallId: note.parentToolCallId,
      }),
      ...(parent?.principal !== undefined && { principal: parent.principal }),
      ...(parent?.harness !== undefined && { harness: parent.harness }),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    })
  }

  /**
   * The stored transcript of a child, for a call that continues it by
   * `sessionId`. It starts with the task of the first call as a user message.
   * `undefined` when `caller` did not start a child with this id. While the
   * child waits on an interrupt, it is the transcript from before that call:
   * the resume adds the newer messages of the child itself.
   */
  async function loadChild(
    subagentRunId: string,
    caller: { threadId: string; subagentRunId?: string },
  ) {
    const stored = await loadMessages(childStoreId(subagentRunId))
    const marker = storedMarker(stored)
    // The id can come from a prompt injection. Never load the child of an
    // other thread.
    if (marker.parentThreadId !== ownerThread(caller)) return undefined
    const messages = withoutPlaceholder(stored)
    const info = storedSubagentInfo(stored)
    const waits = info?.status === 'suspended'
    const transcript =
      waits && marker.base !== undefined
        ? messages.slice(0, marker.base)
        : messages
    const task: Array<ModelMessage> =
      marker.prompt === undefined
        ? []
        : [
            {
              id: `${childStoreId(subagentRunId)}:prompt`,
              role: 'user',
              content: marker.prompt,
            },
          ]
    // The agent the child ran under. Only that agent can continue it.
    return {
      messages: [...task, ...transcript],
      ...(info !== undefined && { agent: info.name }),
    }
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
      note.error = {
        message: chunk.message,
        ...(chunk.code !== undefined && { code: chunk.code }),
      }
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
    loadChild,

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
      const summariesByRun = new Map<string, ReadonlyArray<string>>()
      const parentIds = new Set(
        stored.flatMap((message) => {
          const id = readModelRunId(message)
          return id === undefined ? [] : [id]
        }),
      )
      for (const parentId of parentIds) {
        const blocks: Array<{ name: string; text: string }> = []
        for (const child of (await stores.runs?.listByParentRun?.(parentId)) ??
          []) {
          const transcript = await loadMessages(child.threadId)
          if (storedSubagentInfo(transcript)?.parentToolCallId !== undefined)
            continue
          blocks.push({
            name:
              child.name ?? storedSubagentInfo(transcript)?.name ?? 'subagent',
            text: childText(modelMessagesToUIMessages(transcript)),
          })
        }
        summariesByRun.set(parentId, [
          blocks
            .filter((block) => block.text !== '')
            .map((block) => block.name + ':\n' + block.text)
            .join('\n\n'),
          blocks
            .map((block) => block.text)
            .filter(Boolean)
            .join('\n\n'),
        ])
      }
      await stores.messages.saveThread(
        input.threadId,
        keepSubagentRunIds(stored, merged, summariesByRun),
      )
    },

    async chunk(input: {
      threadId: string
      runId: string
      /** Set when the chat that streams this chunk is a child itself. */
      subagentRunId?: string
      chunk: StreamChunk
    }) {
      const chunk = input.chunk
      if (chunk.type === 'TOOL_CALL_START') {
        calls.set(chunk.toolCallId, { name: chunk.toolCallName, args: '' })
      }
      if (chunk.type === 'TOOL_CALL_ARGS') {
        const call = calls.get(chunk.toolCallId)
        if (call) call.args += chunk.delta
      }
      if (chunk.type === 'TOOL_CALL_RESULT') calls.delete(chunk.toolCallId)
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
