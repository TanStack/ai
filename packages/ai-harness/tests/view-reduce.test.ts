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
  withUserMessage,
} from '../src/view/reduce'
import { at, childRun, custom, sessionSnapshot } from './view-fixtures'
import type { SessionEvent } from '../src'
import type { ItemFactory } from '../src/view/reduce'
import type { SessionViewState } from '../src/view/types'

const fold = (events: Array<SessionEvent>, start = emptyState()) =>
  events.reduce(applyEvent, start)

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
      custom(HARNESS_EVENTS.inputRejected, { inputId: 'j' }),
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
      {
        id: 'notice-5',
        role: 'notice',
        kind: 'rejected',
        text: 'Not accepted: unknown reason',
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
      custom(HARNESS_EVENTS.authRequired, { connector: 'github' }),
    ])
    expect(signedOut.signIns).toEqual([
      { connector: 'notion', url: 'https://b', userCode: 'X1' },
      { connector: 'github' },
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
    const waiting = sessionSnapshot({
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

  // A user message, then a turn with text, a tool call, and a child agent.
  const placed = fold(
    [
      at({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'Hi' }),
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'read',
      }),
      at({
        subagentRunId: 'child-1',
        type: EventType.SUBAGENT_STARTED,
        name: 'helper',
      }),
    ],
    withUserMessage(emptyState(), 'hi'),
  )
  const unchanged: Array<[string, SessionEvent]> = [
    [
      'an empty delta',
      at({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: '' }),
    ],
    [
      'an empty delta of a child',
      at({
        subagentRunId: 'child-1',
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'c',
        delta: '',
      }),
    ],
    [
      'text of a child it does not know',
      at({
        subagentRunId: 'ghost',
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'g',
        delta: 'boo',
      }),
    ],
    [
      'a tool call start that repeats an id',
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'read',
      }),
    ],
    [
      'args of a tool call it does not know',
      at({ type: EventType.TOOL_CALL_ARGS, toolCallId: 'ghost', delta: '{}' }),
    ],
    [
      'a result of a tool call it does not know',
      at({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'ghost',
        messageId: 'x',
        content: '1',
      }),
    ],
    [
      'a child start that repeats an id',
      at({
        subagentRunId: 'child-1',
        type: EventType.SUBAGENT_STARTED,
        name: 'helper',
      }),
    ],
    ['a run error of a child', at(childRun.error)],
    [
      'a state snapshot without plugins',
      at({ type: EventType.STATE_SNAPSHOT, snapshot: { other: 1 } }, 'session'),
    ],
    [
      'an event it does not show',
      at({ type: EventType.RUN_STARTED, threadId: 't', runId: 'r' }),
    ],
    [
      'a config change for a key it does not know',
      custom(HARNESS_EVENTS.configChanged, { key: 'ghost', value: 1 }),
    ],
    [
      'a config change without a key',
      custom(HARNESS_EVENTS.configChanged, { value: 1 }),
    ],
    [
      'a command result with no text',
      custom('harness.command.result', { name: 'stats', result: '' }),
    ],
    [
      'a sign-in request without a connector',
      custom(HARNESS_EVENTS.authRequired, { url: 'https://a' }),
    ],
    [
      'a chat start with no sign-ins',
      custom(HARNESS_EVENTS.operationStarted, {
        operationId: 'op-2',
        kind: 'chat',
      }),
    ],
    ['a custom event it does not know', custom('app.unknown', null)],
  ]

  it.each(unchanged)('returns the same state for %s', (_name, entry) => {
    expect(applyEvent(placed, entry)).toBe(placed)
  })

  it('routes child events to the right agent among nested and sibling agents', () => {
    const state = fold([
      at({
        subagentRunId: 'child-1',
        type: EventType.SUBAGENT_STARTED,
        name: 'helper',
      }),
      at({
        subagentRunId: 'grand-1',
        type: EventType.SUBAGENT_STARTED,
        name: 'inner',
        parentSubagentRunId: 'child-1',
      }),
      at({
        subagentRunId: 'child-2',
        type: EventType.SUBAGENT_STARTED,
        name: 'fixer',
      }),
      // Its parent is unknown, so it goes to the top level.
      at({
        subagentRunId: 'child-3',
        type: EventType.SUBAGENT_STARTED,
        name: 'lost',
        parentSubagentRunId: 'ghost',
      }),
      at({
        subagentRunId: 'child-2',
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'c2',
        delta: 'two',
      }),
      at({
        subagentRunId: 'grand-1',
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'g1',
        delta: 'inner',
      }),
      at({
        subagentRunId: 'child-2',
        type: EventType.TOOL_CALL_START,
        toolCallId: 't2',
        toolCallName: 'Edit',
      }),
      at({
        subagentRunId: 'child-2',
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 't2',
        messageId: 'r2',
        content: '{"ok":true}',
      }),
    ])
    expect(assistantParts(state)).toEqual([
      {
        type: 'agent',
        id: 'child-1',
        name: 'helper',
        status: 'running',
        parts: [
          {
            type: 'agent',
            id: 'grand-1',
            name: 'inner',
            status: 'running',
            parts: [{ type: 'text', text: 'inner' }],
          },
        ],
      },
      {
        type: 'agent',
        id: 'child-2',
        name: 'fixer',
        status: 'running',
        parts: [
          { type: 'text', text: 'two' },
          {
            type: 'tool-call',
            id: 't2',
            name: 'Edit',
            argsText: '',
            args: undefined,
            status: 'done',
            result: { ok: true },
          },
        ],
      },
      {
        type: 'agent',
        id: 'child-3',
        name: 'lost',
        status: 'running',
        parts: [],
      },
    ])
  })

  it('keeps content parts of a tool result, and text that is not JSON', () => {
    const state = fold([
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'shot',
      }),
      at({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'c1',
        messageId: 'r1',
        content: [{ type: 'text', text: 'see the image' }],
      }),
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c2',
        toolCallName: 'say',
      }),
      at({ type: EventType.TOOL_CALL_ARGS, toolCallId: 'c2', delta: 'loud' }),
      at({ type: EventType.TOOL_CALL_END, toolCallId: 'c2' }),
      at({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'c2',
        messageId: 'r2',
        content: 'plain words',
      }),
    ])
    expect(assistantParts(state)).toEqual([
      {
        type: 'tool-call',
        id: 'c1',
        name: 'shot',
        argsText: '',
        args: undefined,
        status: 'done',
        result: [{ type: 'text', text: 'see the image' }],
      },
      {
        type: 'tool-call',
        id: 'c2',
        name: 'say',
        argsText: 'loud',
        args: 'loud',
        status: 'done',
        result: 'plain words',
      },
    ])
  })

  it('marks only running tool calls as failed on a run error', () => {
    const state = fold([
      at({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'Trying.',
      }),
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'read',
      }),
      at({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'c1',
        messageId: 'r',
        content: '"ok"',
      }),
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c2',
        toolCallName: 'write',
      }),
      at({ type: EventType.RUN_ERROR, message: 'boom' }),
    ])
    expect(
      assistantParts(state).map((part) =>
        part.type === 'tool-call' ? `${part.id}:${part.status}` : part.type,
      ),
    ).toEqual(['text', 'c1:done', 'c2:failed'])
  })

  it('adds only a notice for a run error with no running tool call', () => {
    const state = fold([at({ type: EventType.RUN_ERROR, message: 'boom' })])
    expect(state.messages).toEqual([
      { id: 'notice-0', role: 'notice', kind: 'error', text: 'Error: boom' },
    ])
  })

  it('finds tool calls in earlier turns, names unnamed agents, and skips other operations', () => {
    const turns = fold(
      [
        at({
          type: EventType.TOOL_CALL_START,
          toolCallId: 'c1',
          toolCallName: 'read',
        }),
        at(
          {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'n',
            delta: 'Next.',
          },
          'op-2',
        ),
      ],
      withUserMessage(emptyState(), 'hi'),
    )
    const state = applySnapshot(
      turns,
      sessionSnapshot({
        pendingInterrupts: [
          { id: 'i1', reason: 'tool_approval', toolCallId: 'c1' },
          { id: 'i2', reason: 'tool_approval', toolCallId: 'ghost' },
          { id: 'i3', reason: 'confirm' },
        ],
        activeOperations: [
          { id: 'op-a', kind: 'agent' },
          { id: 'op-c', kind: 'chat' },
        ],
      }),
      factory,
    )
    expect(state.approvals.map((item) => item.tool)).toEqual([
      'read',
      'tool',
      'tool',
    ])
    expect(state.agents).toEqual([{ id: 'op-a', name: 'agent' }])
    expect(state.messages[1]).toMatchObject({
      parts: [{ id: 'c1', status: 'needs-approval' }],
    })
    expect(state.messages[0]).toBe(turns.messages[0])
    expect(state.messages[2]).toBe(turns.messages[2])
  })

  it('builds transcript messages from content parts, saved ids, and failed tool results', () => {
    const messages = messagesFromTranscript([
      {
        id: 'saved-1',
        role: 'user',
        content: [
          { type: 'text', content: 'Look at ' },
          {
            type: 'image',
            source: { type: 'url', value: 'https://example.com/a.png' },
          },
          { type: 'text', content: 'this.' },
        ],
      },
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'c1',
            type: 'function',
            function: { name: 'read', arguments: 'not json' },
          },
        ],
      },
      {
        role: 'tool',
        content: 'no such file',
        toolCallId: 'c1',
        error: 'ENOENT',
      },
      // A result whose call is not in the transcript.
      { role: 'tool', content: 'orphan', toolCallId: 'ghost' },
      { role: 'assistant', content: '' },
    ])
    expect(messages).toEqual([
      { id: 'saved-1', role: 'user', text: 'Look at this.' },
      {
        id: 'history-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'c1',
            name: 'read',
            argsText: 'not json',
            args: 'not json',
            status: 'failed',
            result: 'no such file',
          },
        ],
      },
      { id: 'history-4', role: 'assistant', parts: [] },
    ])
  })
})
