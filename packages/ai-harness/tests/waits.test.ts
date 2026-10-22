import { describe, expect, it } from 'vitest'
import {
  isApproval,
  waitKind,
  waitFromInterrupt,
  waitFromQuestion,
} from '../src'
import type { Interrupt } from '@tanstack/ai'
import type { Wait } from '../src'

const BINDING = 'tanstack:interruptBinding'

const approval: Interrupt = {
  id: 'approve-1',
  reason: 'tool_call',
  message: 'Approval required to run remove',
  toolCallId: 'c1',
  metadata: {
    kind: 'approval',
    [BINDING]: {
      v: 1,
      kind: 'tool-approval',
      interruptId: 'approve-1',
      toolName: 'remove',
      toolCallId: 'c1',
      originalArgs: {},
      inputSchemaHash: 'in',
      approvalSchemaHash: 'approval',
      responseSchemaHash: 'response',
    },
  },
}

const clientTool: Interrupt = {
  id: 'client_tool_c2',
  reason: 'tanstack:client_tool_execution',
  toolCallId: 'c2',
  metadata: {
    [BINDING]: {
      v: 1,
      kind: 'client-tool-execution',
      interruptId: 'client_tool_c2',
      toolName: 'openScreen',
      toolCallId: 'c2',
      outputSchemaHash: 'out',
      responseSchemaHash: 'response',
    },
  },
}

const signIn: Interrupt = {
  id: 'mcp_input_c3',
  reason: 'auth_required',
  toolCallId: 'c3',
  metadata: {
    [BINDING]: { v: 1, kind: 'generic', interruptId: 'mcp_input_c3' },
    'tanstack:interruptPayload': {
      kind: 'form',
      request: { connector: 'github', url: 'https://example.test/a' },
    },
  },
}

/** An MCP form: a generic binding with no definition. */
const form: Interrupt = {
  id: 'mcp_input_c4',
  reason: 'mcp_input',
  message: 'Input required to run deploy',
  toolCallId: 'c4',
  metadata: {
    [BINDING]: { v: 1, kind: 'generic', interruptId: 'mcp_input_c4' },
    'tanstack:interruptPayload': { kind: 'form', request: { field: 'x' } },
  },
}

/** An interrupt of `defineInterrupt`: a generic binding with a definition. */
const handoff: Interrupt = {
  id: 'int-5',
  reason: 'handoff',
  message: 'A person takes over.',
  responseSchema: { type: 'object' },
  expiresAt: '2030-01-02T03:04:05.000Z',
  metadata: {
    [BINDING]: {
      v: 1,
      kind: 'generic',
      interruptId: 'int-5',
      definitionId: 'handoff',
      key: 'handoff',
      batchIndex: 0,
    },
  },
}

/** An interrupt with no binding of `chat()`: a plain stop for a yes or no. */
const plain: Interrupt = { id: 'plain', reason: 'confirm' }

describe('waitKind', () => {
  it('gives one kind to each interrupt', () => {
    expect(
      [approval, clientTool, signIn, form, handoff, plain].map(waitKind),
    ).toEqual([
      'approval',
      'client-tool',
      'sign-in',
      'question',
      'human',
      'approval',
    ])
  })

  it('reads the kind of a wait from the wait', () => {
    const wait: Wait = { waitId: 'w1', kind: 'human', runId: 'run-1' }
    expect(waitKind(wait)).toBe('human')
    expect(isApproval(wait)).toBe(false)
    expect(isApproval({ ...wait, kind: 'approval' })).toBe(true)
  })

  it('reads a binding for another interrupt id as no binding', () => {
    // The binding names another interrupt, so it is not this one's.
    const foreign: Interrupt = {
      ...clientTool,
      id: 'other',
    }
    expect(waitKind(foreign)).toBe('approval')
  })
})

describe('isApproval', () => {
  it('is true only for a yes or no on a tool call', () => {
    expect(
      [approval, clientTool, signIn, form, handoff, plain].map(isApproval),
    ).toEqual([true, false, false, false, false, true])
  })
})

describe('waitFromInterrupt', () => {
  it('keeps the id, the kind, the schema, the message, and the expiry', () => {
    const user = { id: 'u1', tenantId: 'acme' }
    expect(
      waitFromInterrupt({ interrupt: handoff, runId: 'run-1', user }),
    ).toEqual({
      waitId: 'int-5',
      kind: 'human',
      runId: 'run-1',
      user,
      schema: { type: 'object' },
      expiresAt: Date.parse('2030-01-02T03:04:05.000Z'),
      message: 'A person takes over.',
    })
  })

  it('leaves out an expiry that is not a date, and the fields it lacks', () => {
    expect(
      waitFromInterrupt({
        interrupt: { ...plain, expiresAt: 'soon' },
        runId: 'run-2',
      }),
    ).toEqual({ waitId: 'plain', kind: 'approval', runId: 'run-2' })
  })
})

describe('waitFromQuestion', () => {
  it('makes a question wait of the run that asks', () => {
    expect(
      waitFromQuestion({
        question: {
          questionId: 'q1',
          message: 'How many?',
          schema: { type: 'number' },
          secret: true,
        },
        runId: 'cmd-1',
        user: { id: 'u1' },
        expiresAt: 1234,
      }),
    ).toEqual({
      waitId: 'q1',
      kind: 'question',
      runId: 'cmd-1',
      user: { id: 'u1' },
      schema: { type: 'number' },
      expiresAt: 1234,
      message: 'How many?',
    })
  })
})

describe('the waits of the turn boundary', () => {
  /** An interrupt of `definitionId`, as `onInterruptBoundary` opens it. */
  const boundary = (definitionId: string, payload: unknown): Interrupt => ({
    id: `int-${definitionId}`,
    reason: 'boundary',
    message: 'Allow bash ls?',
    responseSchema: { type: 'object' },
    metadata: {
      [BINDING]: {
        v: 1,
        kind: 'generic',
        interruptId: `int-${definitionId}`,
        definitionId,
        key: 'c1',
        batchIndex: 0,
      },
      'tanstack:interruptPayload': payload,
    },
  })

  it('makes an approval of permissions() an approval, not a human wait', () => {
    const approvalWait = boundary('tanstack/harness:approval', {
      toolCallId: 'c1',
      tool: 'bash',
    })
    expect(waitKind(approvalWait)).toBe('approval')
    expect(isApproval(approvalWait)).toBe(true)
  })

  it('makes a question of the question tool a question, with the answer shape of that question', () => {
    const schema = { type: 'string', enum: ['Postgres', 'SQLite'] }
    const questionWait = boundary('tanstack/harness:question', {
      toolCallId: 'c1',
      index: 0,
      schema,
    })
    expect(waitKind(questionWait)).toBe('question')
    expect(
      waitFromInterrupt({ interrupt: questionWait, runId: 'run-1' }),
    ).toEqual({
      waitId: 'int-tanstack/harness:question',
      kind: 'question',
      runId: 'run-1',
      schema,
      message: 'Allow bash ls?',
    })
  })
})
