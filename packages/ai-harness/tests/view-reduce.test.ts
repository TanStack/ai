import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS } from '../src'
import {
  applyDescription,
  applyEvent,
  applySnapshot,
  emptyState,
  messagesFromTranscript,
  withNotice,
} from '../src/view/reduce'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent, SessionSnapshot } from '../src'
import type { ItemFactory } from '../src/view/reduce'
import type { SessionViewState } from '../src/view/types'

let cursor = 0
const at = (event: StreamChunk, operationId = 'op-1'): SessionEvent => {
  cursor += 1
  return { cursor: String(cursor), operationId, event }
}
const fold = (events: Array<SessionEvent>, start = emptyState()) =>
  events.reduce(applyEvent, start)
const custom = (name: string, value: unknown) =>
  at({ type: EventType.CUSTOM, name, value }, 'session')

const factory: ItemFactory = {
  approval: (interrupt, call) => ({
    id: interrupt.id,
    ...(interrupt.toolCallId ? { toolCallId: interrupt.toolCallId } : {}),
    tool: call?.name ?? 'tool',
    args: call?.args,
    approve: () => {},
    reject: () => {},
  }),
  question: (question) => ({
    id: question.questionId,
    message: question.message,
    answer: async () => ({ inputId: 'i', status: 'accepted' }),
  }),
}

const snapshot = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  threadId: 't',
  status: 'idle',
  activeOperations: [],
  queuedTurns: 0,
  pendingInterrupts: [],
  pendingQuestions: [],
  plugins: {},
  cursor: '0',
  ...over,
})

function assistantParts(state: SessionViewState) {
  const message = state.messages.find((item) => item.role === 'assistant')
  return message?.role === 'assistant' ? message.parts : []
}

describe('view reducer', () => {
  it('streams text and reasoning into one assistant message per turn', () => {
    const state = fold([
      at({
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'r',
        delta: 'Think',
      }),
      at({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'Hel',
      }),
      at({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'lo' }),
      at(
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'n',
          delta: 'Next turn',
        },
        'op-2',
      ),
    ])
    expect(state.messages).toEqual([
      {
        id: 'turn-op-1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'Think' },
          { type: 'text', text: 'Hello' },
        ],
      },
      {
        id: 'turn-op-2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Next turn' }],
      },
    ])
  })

  it('builds tool calls from start, args, end, and a result in a later turn', () => {
    const state = fold([
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'remove',
      }),
      at({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'c1',
        delta: '{"path":',
      }),
      at({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'c1',
        delta: '"a.txt"}',
      }),
      at({ type: EventType.TOOL_CALL_END, toolCallId: 'c1' }),
      // The approved call finishes in the next turn.
      at(
        {
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: 'c1',
          messageId: 'x',
          content: '"removed"',
        },
        'op-2',
      ),
    ])
    expect(state.messages).toHaveLength(1)
    expect(assistantParts(state)).toEqual([
      {
        type: 'tool-call',
        id: 'c1',
        name: 'remove',
        argsText: '{"path":"a.txt"}',
        args: { path: 'a.txt' },
        status: 'done',
        result: 'removed',
      },
    ])
  })

  it('ignores a tool result it has no call for', () => {
    const start = emptyState()
    const state = fold(
      [
        at({
          type: EventType.TOOL_CALL_RESULT,
          toolCallId: 'ghost',
          messageId: 'x',
          content: '1',
        }),
      ],
      start,
    )
    expect(state).toBe(start)
  })

  it('nests child agents with their own text and tool calls', () => {
    const child = { subagentRunId: 'child-1' }
    const state = fold([
      at({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'Asking a helper.',
      }),
      at({ ...child, type: EventType.SUBAGENT_STARTED, name: 'claude_code' }),
      at({
        ...child,
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'c',
        delta: 'Done',
      }),
      at({
        ...child,
        type: EventType.TOOL_CALL_START,
        toolCallId: 't1',
        toolCallName: 'Edit',
      }),
      at({
        subagentRunId: 'grand-1',
        type: EventType.SUBAGENT_STARTED,
        name: 'inner',
        parentSubagentRunId: 'child-1',
      }),
      at({
        subagentRunId: 'grand-1',
        type: EventType.SUBAGENT_ERROR,
        message: 'no key',
      }),
      at({ ...child, type: EventType.SUBAGENT_FINISHED }),
    ])
    const [lead, agent] = assistantParts(state)
    expect(lead).toEqual({ type: 'text', text: 'Asking a helper.' })
    expect(agent).toMatchObject({
      type: 'agent',
      id: 'child-1',
      name: 'claude_code',
      status: 'done',
      parts: [
        { type: 'text', text: 'Done' },
        { type: 'tool-call', id: 't1', name: 'Edit', status: 'running' },
        {
          type: 'agent',
          id: 'grand-1',
          name: 'inner',
          status: 'failed',
          error: 'no key',
          parts: [],
        },
      ],
    })
  })

  it('a child that starts first gets its own assistant message', () => {
    const state = fold([
      at({
        subagentRunId: 'child-1',
        type: EventType.SUBAGENT_STARTED,
        name: 'codex',
      }),
    ])
    expect(state.messages).toEqual([
      {
        id: 'turn-op-1',
        role: 'assistant',
        parts: [
          {
            type: 'agent',
            id: 'child-1',
            name: 'codex',
            status: 'running',
            parts: [],
          },
        ],
      },
    ])
  })

  it('adds notices for errors, resumes, command text, and rejected inputs', () => {
    const state = fold([
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'slow',
      }),
      at({ type: EventType.RUN_ERROR, message: 'boom' }),
      custom(HARNESS_EVENTS.operationResumed, {}),
      at(
        {
          type: EventType.CUSTOM,
          name: 'harness.command.result',
          value: { name: 'goal', result: 'Goal: x' },
        },
        'op-c',
      ),
      at(
        {
          type: EventType.CUSTOM,
          name: 'harness.command.result',
          value: { name: 'stats', result: { ok: true } },
        },
        'op-d',
      ),
      custom(HARNESS_EVENTS.inputRejected, { inputId: 'i', reason: 'busy' }),
    ])
    expect(state.messages.filter((item) => item.role === 'notice')).toEqual([
      { id: 'notice-1', role: 'notice', kind: 'error', text: 'Error: boom' },
      {
        id: 'notice-2',
        role: 'notice',
        kind: 'info',
        text: 'Resumed a turn that a crash stopped.',
      },
      { id: 'notice-3', role: 'notice', kind: 'command', text: 'Goal: x' },
      {
        id: 'notice-4',
        role: 'notice',
        kind: 'rejected',
        text: 'Not accepted: busy',
      },
    ])
    expect(assistantParts(state)[0]).toMatchObject({ status: 'failed' })
  })

  it('keeps sign-ins per connector and clears them when a chat turn starts', () => {
    const signedOut = fold([
      custom(HARNESS_EVENTS.authRequired, {
        connector: 'notion',
        url: 'https://a',
      }),
      custom(HARNESS_EVENTS.authRequired, {
        connector: 'notion',
        url: 'https://b',
        userCode: 'X1',
      }),
    ])
    expect(signedOut.signIns).toEqual([
      { connector: 'notion', url: 'https://b', userCode: 'X1' },
    ])
    const next = applyEvent(
      signedOut,
      custom(HARNESS_EVENTS.operationStarted, {
        operationId: 'op-9',
        kind: 'chat',
      }),
    )
    expect(next.signIns).toEqual([])
  })

  it('follows plugin state and config values', () => {
    const described = applyDescription(emptyState(), {
      commands: [],
      tools: [],
      config: [
        {
          key: 'mode',
          owner: 'p',
          value: 'build',
          option: { type: 'text', default: 'build' },
        },
      ],
    })
    const state = fold(
      [
        at(
          {
            type: EventType.STATE_SNAPSHOT,
            snapshot: { plugins: { 'tanstack/goal': { round: 2 } } },
          },
          'session',
        ),
        custom(HARNESS_EVENTS.configChanged, { key: 'mode', value: 'plan' }),
      ],
      described,
    )
    expect(state.plugins).toEqual({ 'tanstack/goal': { round: 2 } })
    expect(state.config[0]?.value).toBe('plan')
  })

  it('reads status, approvals, questions, and agents from the snapshot, and keeps item identity', () => {
    const withCall = fold([
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'remove',
      }),
      at({ type: EventType.TOOL_CALL_ARGS, toolCallId: 'c1', delta: '{}' }),
      at({ type: EventType.TOOL_CALL_END, toolCallId: 'c1' }),
    ])
    const waiting = snapshot({
      status: 'requires_action',
      pendingInterrupts: [
        { id: 'int-1', reason: 'tool_approval', toolCallId: 'c1' },
      ],
      pendingQuestions: [{ questionId: 'q1', message: 'Sure?' }],
      activeOperations: [{ id: 'op-a', kind: 'agent', agent: 'pricer' }],
      queuedTurns: 1,
      plugins: { p: 1 },
    })
    const first = applySnapshot(withCall, waiting, factory, { initial: true })
    expect(first.status).toBe('requires_action')
    expect(first.queuedTurns).toBe(1)
    expect(first.approvals).toMatchObject([
      { id: 'int-1', tool: 'remove', args: {} },
    ])
    expect(first.questions).toMatchObject([{ id: 'q1', message: 'Sure?' }])
    expect(first.agents).toEqual([{ id: 'op-a', name: 'pricer' }])
    expect(first.plugins).toEqual({ p: 1 })
    expect(assistantParts(first)[0]).toMatchObject({ status: 'needs-approval' })

    const again = applySnapshot(
      first,
      { ...waiting, plugins: { p: 2 } },
      factory,
    )
    expect(again).toBe(first)
  })

  it('builds messages from a saved transcript', () => {
    const messages = messagesFromTranscript([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'Checking.',
        thinking: [{ content: 'plan' }],
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'read', arguments: '{"a":1}' },
          },
        ],
      },
      { role: 'tool', content: '"file text"', toolCallId: 'c1' },
    ])
    expect(messages).toEqual([
      { id: 'history-0', role: 'user', text: 'hi' },
      {
        id: 'history-1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'plan' },
          { type: 'text', text: 'Checking.' },
          {
            type: 'tool-call',
            id: 'c1',
            name: 'read',
            argsText: '{"a":1}',
            args: { a: 1 },
            status: 'done',
            result: 'file text',
          },
        ],
      },
    ])
  })

  it('numbers notices by position', () => {
    const state = withNotice(withNotice(emptyState(), 'ui', 'a'), 'ui', 'b')
    expect(state.messages.map((item) => item.id)).toEqual([
      'notice-0',
      'notice-1',
    ])
  })
})
