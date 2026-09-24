import { describe, expect, it } from 'vitest'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  defineAgent,
  uiMessagesToWire,
} from '@tanstack/ai'
import type {
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
  SubagentStatus,
  UIMessage,
} from '@tanstack/ai'
import { memoryPersistence, reconstructChat, withPersistence } from '../src'

// AnyTextAdapter brands private adapter fields. A partial object cannot
// satisfy that type, and this test must not call the parent model.
function parentAdapter(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream() {
      throw new Error('parent model should not run')
    },
  } as unknown as AnyTextAdapter
}

function textChunk(messageId: string, delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
    timestamp: 1,
  }
}

function noteAgent(name: string, description: string, delta: string) {
  return defineAgent({
    name,
    description,
    run: async function* () {
      yield textChunk(`${name}-note`, delta)
    },
  })
}

type Card = {
  type: string
  content?: string
  subagent?: {
    id?: string
    name: string
    status?: string
    parentRunId?: string
    messages: Array<{ parts: Array<{ content?: string }> }>
  }
}

type DeskMessage = {
  id: string
  role: string
  metadata?: { tanstack?: { runId?: string } }
  parts: Array<Card>
}

type Desk = {
  activeRun: { runId: string } | null
  messages: Array<DeskMessage>
}

function isDesk(value: unknown): value is Desk {
  if (value == null || typeof value !== 'object') return false
  if (!('messages' in value) || !Array.isArray(value.messages)) return false
  return 'activeRun' in value
}

async function loadDesk(
  persistence: ReturnType<typeof memoryPersistence>,
): Promise<Desk> {
  const response = await reconstructChat(
    persistence,
    new Request('http://local/api/chat?threadId=blog-desk'),
  )
  const body: unknown = await response.json()
  if (!isDesk(body)) {
    throw new Error('reconstructChat returned an unexpected body')
  }
  return body
}

function cardsOf(message: DeskMessage | undefined) {
  return message?.parts.filter((part) => part.type === 'subagent') ?? []
}

function cardText(message: DeskMessage | undefined, name: string) {
  const card = cardsOf(message).find((part) => part.subagent?.name === name)
  return card?.subagent?.messages[0]?.parts[0]?.content
}

function statusOf(value: string | undefined): SubagentStatus {
  if (value === 'running' || value === 'error' || value === 'suspended') {
    return value
  }
  return 'finished'
}

function toUi(messages: Array<DeskMessage>): Array<UIMessage> {
  return messages.map((message) => {
    const parts: UIMessage['parts'] = []
    for (const part of message.parts) {
      if (part.type === 'text' && part.content !== undefined) {
        parts.push({ type: 'text', content: part.content })
        continue
      }
      const subagent = part.subagent
      if (part.type !== 'subagent' || subagent === undefined) continue
      parts.push({
        type: 'subagent',
        subagent: {
          id: subagent.id ?? subagent.name,
          name: subagent.name,
          status: statusOf(subagent.status),
          ...(subagent.parentRunId !== undefined
            ? { parentRunId: subagent.parentRunId }
            : {}),
          messages: subagent.messages.map((child, index) => ({
            id: `child-${subagent.name}-${index}`,
            role: 'assistant' as const,
            parts: child.parts.flatMap((piece) =>
              piece.content === undefined
                ? []
                : [{ type: 'text' as const, content: piece.content }],
            ),
          })),
        },
      })
    }
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    return {
      id: message.id,
      role,
      parts,
      ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
    }
  })
}

function visibleText(messages: ReadonlyArray<UIMessage | ModelMessage>) {
  return messages
    .map((message) => {
      if ('parts' in message) {
        return message.parts
          .map((part) => {
            if (part.type === 'text') return part.content
            if (part.type !== 'subagent') return ''
            return part.subagent.messages
              .map((child) =>
                'parts' in child
                  ? child.parts
                      .map((piece) =>
                        piece.type === 'text' ? piece.content : '',
                      )
                      .join('\n')
                  : '',
              )
              .join('\n')
          })
          .join('\n')
      }
      return typeof message.content === 'string' ? message.content : ''
    })
    .join('\n')
}

async function runChat(input: {
  persistence: ReturnType<typeof memoryPersistence>
  runId: string
  messages: Array<UIMessage | ModelMessage>
  agents: ReturnType<typeof noteAgent>[]
  router: () => Array<string>
}) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of chat({
    adapter: parentAdapter(),
    threadId: 'blog-desk',
    runId: input.runId,
    messages: input.messages,
    middleware: [withPersistence(input.persistence)],
    subagents: {
      agents: input.agents,
      strategy: 'exclusive',
      router: input.router,
    },
  })) {
    chunks.push(chunk)
  }
  return chunks
}

async function sendFollowUp(input: {
  persistence: ReturnType<typeof memoryPersistence>
  messages: Array<UIMessage>
  seen: { text: string }
}) {
  const wire = uiMessagesToWire(input.messages)
  const params = await chatParamsFromRequestBody({
    threadId: 'blog-desk',
    runId: 'run-2',
    messages: wire,
    tools: [],
    context: [],
  })
  const writer = defineAgent({
    name: 'writer',
    description: 'Writes the article',
    run: async function* (ctx) {
      input.seen.text = visibleText(ctx.messages)
      yield textChunk('article', 'Draft article')
    },
  })
  await runChat({
    persistence: input.persistence,
    runId: 'run-2',
    messages: params.messages,
    agents: [
      noteAgent('researcher', 'Looks up facts', 'unused'),
      noteAgent('seo', 'Suggests titles', 'unused'),
      writer,
    ],
    router: () => ['writer'],
  })
}

describe('reconstruct subagent cards', () => {
  it('puts both child texts back on the parent message', async () => {
    const persistence = memoryPersistence()
    await runChat({
      persistence,
      runId: 'run-1',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', content: 'research and seo' }],
        },
      ],
      agents: [
        noteAgent('researcher', 'Looks up facts', 'Octopus notes'),
        noteAgent('seo', 'Suggests titles', 'Title ideas'),
      ],
      router: () => ['researcher', 'seo'],
    })

    const body = await loadDesk(persistence)
    expect(body.activeRun).toBeNull()
    const assistant = body.messages.find(
      (message) => message.role === 'assistant',
    )
    expect(cardText(assistant, 'researcher')).toBe('Octopus notes')
    expect(cardText(assistant, 'seo')).toBe('Title ideas')
    expect(
      cardsOf(assistant).every(
        (part) => part.subagent?.parentRunId === 'run-1',
      ),
    ).toBe(true)
    const runs = await persistence.stores.runs.listByParentRun?.('run-1')
    expect(runs?.map((run) => run.name).sort()).toEqual(['researcher', 'seo'])
    expect(runs?.every((run) => run.subagentRunId === run.runId)).toBe(true)
    expect(runs?.every((run) => run.threadId !== 'blog-desk')).toBe(true)
  })

  it('keeps the cards when a later message is sent after a reload', async () => {
    const persistence = memoryPersistence()
    await runChat({
      persistence,
      runId: 'run-1',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', content: 'research and seo' }],
        },
      ],
      agents: [
        noteAgent('researcher', 'Looks up facts', 'Octopus notes'),
        noteAgent('seo', 'Suggests titles', 'Title ideas'),
      ],
      router: () => ['researcher', 'seo'],
    })
    const first = await loadDesk(persistence)
    const seen = { text: '' }
    await sendFollowUp({
      persistence,
      messages: [
        ...toUi(first.messages),
        {
          id: 'user-2',
          role: 'user',
          parts: [{ type: 'text', content: 'Now write the article' }],
        },
      ],
      seen,
    })

    expect(seen.text).toContain('Octopus notes')
    expect(seen.text).toContain('Title ideas')
    const body = await loadDesk(persistence)
    const assistants = body.messages.filter(
      (message) => message.role === 'assistant',
    )
    expect(cardText(assistants[0], 'researcher')).toBe('Octopus notes')
    expect(cardText(assistants[0], 'seo')).toBe('Title ideas')
    expect(cardText(assistants[1], 'writer')).toBe('Draft article')
  })

  it('keeps the cards when the live client uses its own assistant id', async () => {
    const persistence = memoryPersistence()
    await runChat({
      persistence,
      runId: 'run-1',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', content: 'research and seo' }],
        },
      ],
      agents: [
        noteAgent('researcher', 'Looks up facts', 'Octopus notes'),
        noteAgent('seo', 'Suggests titles', 'Title ideas'),
      ],
      router: () => ['researcher', 'seo'],
    })
    const first = await loadDesk(persistence)
    const live = toUi(first.messages).map((message) =>
      message.role === 'assistant'
        ? {
            id: 'live-assistant',
            role: 'assistant' as const,
            parts: message.parts,
          }
        : message,
    )
    const seen = { text: '' }
    await sendFollowUp({
      persistence,
      messages: [
        ...live,
        {
          id: 'user-2',
          role: 'user',
          parts: [{ type: 'text', content: 'Now write the article' }],
        },
      ],
      seen,
    })

    expect(seen.text).toContain('Octopus notes')
    const body = await loadDesk(persistence)
    const research = body.messages.find((message) =>
      cardsOf(message).some((part) => part.subagent?.name === 'researcher'),
    )
    expect(cardText(research, 'researcher')).toBe('Octopus notes')
    expect(cardText(research, 'seo')).toBe('Title ideas')
  })

  it('shows partial cards while both children are still running', async () => {
    const persistence = memoryPersistence()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = () => {
        resolve()
      }
    })
    const waiting = (name: string, delta: string) =>
      defineAgent({
        name,
        description: name,
        run: async function* () {
          yield textChunk(`${name}-note`, delta)
          await gate
        },
      })

    const stream = chat({
      adapter: parentAdapter(),
      threadId: 'blog-desk',
      runId: 'run-1',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', content: 'research and seo' }],
        },
      ],
      // Write every delta, so the reload below sees both first notes.
      middleware: [withPersistence(persistence, { snapshotIntervalMs: 0 })],
      subagents: {
        agents: [
          waiting('researcher', 'Octopus notes'),
          waiting('seo', 'Title ideas'),
        ],
        strategy: 'exclusive',
        router: () => ['researcher', 'seo'],
      },
    })
    const iterator = stream[Symbol.asyncIterator]()
    try {
      const seen: Array<StreamChunk> = []
      while (
        seen.filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT').length < 2
      ) {
        const next = await iterator.next()
        if (next.done) break
        seen.push(next.value)
      }
      const mid = await loadDesk(persistence)
      expect(mid.activeRun?.runId).toBe('run-1')
      const assistant = mid.messages.find(
        (message) => message.role === 'assistant',
      )
      expect(cardText(assistant, 'researcher')).toBe('Octopus notes')
      expect(cardText(assistant, 'seo')).toBe('Title ideas')
      expect(
        cardsOf(assistant).every((part) => part.subagent?.status === 'running'),
      ).toBe(true)
    } finally {
      release()
      while (true) {
        const next = await iterator.next()
        if (next.done) break
      }
    }

    const done = await loadDesk(persistence)
    expect(done.activeRun).toBeNull()
    const assistant = done.messages.find(
      (message) => message.role === 'assistant',
    )
    expect(
      cardsOf(assistant).every((part) => part.subagent?.status === 'finished'),
    ).toBe(true)
  })
})
