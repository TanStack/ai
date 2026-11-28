import { describe, expect, it } from 'vitest'
import { EventType, chat } from '../src'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type {
  ActivityRecord,
  ChatMiddleware,
  SandboxApprovalContent,
  UIMessage,
} from '../src'

const approvalId = 'claude-code:command:rm -rf build'
const rowId = `sandbox.approval:${approvalId}`

const user: UIMessage = {
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', content: 'Clean the build folder' }],
}

/** A tool-call part that denied an action with the same approval id. */
const deniedToolCall: UIMessage = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-call',
      id: 'call-1',
      name: 'runCommand',
      arguments: '{}',
      state: 'approval-responded',
      approval: { id: approvalId, needsApproval: true, approved: false },
    },
  ],
}

function approvalContent(status: SandboxApprovalContent['status']) {
  return { approvalId, title: 'Run rm -rf build', status }
}

/** The `sandbox.approval` row that the client sends back. */
function approvalRow(status: SandboxApprovalContent['status']): UIMessage {
  return {
    id: rowId,
    role: 'activity',
    parts: [
      {
        type: 'activity',
        activityType: 'sandbox.approval',
        content: approvalContent(status),
      },
    ],
  }
}

/**
 * Puts a granted row into the run activities, the way `withPersistence` loads
 * its activity store. The request does not carry the row.
 */
const storedGrantedRow: ChatMiddleware = {
  name: 'stored-activities',
  onConfig: () => {
    const record: ActivityRecord = {
      id: rowId,
      activityType: 'sandbox.approval',
      content: approvalContent('granted'),
      index: 1,
    }
    return { activities: [record] }
  },
}

/** Run one turn and return the `approvals` that the adapter got. */
async function adapterApprovals(
  messages: Array<UIMessage>,
  middleware: Array<ChatMiddleware> = [],
) {
  const { adapter, calls } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.textStart(),
        ev.textContent('ok'),
        ev.textEnd(),
        ev.runFinished(),
      ],
    ],
  })
  await collectChunks(
    chat({
      adapter,
      threadId: 'thread-1',
      stream: true,
      messages: [user, ...messages],
      middleware,
    }),
  )
  return calls[0]?.approvals
}

/**
 * Run one turn whose adapter sends the decision of the row at its start, as a
 * harness adapter does. Return the deltas that reach the client.
 */
async function decisionDeltas(messages: Array<UIMessage>) {
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.activityDelta(rowId, 'sandbox.approval', [
          { op: 'replace', path: '/status', value: 'granted' },
        ]),
        ev.textStart(),
        ev.textContent('ok'),
        ev.textEnd(),
        ev.runFinished(),
      ],
    ],
  })
  const chunks = await collectChunks(
    chat({
      adapter,
      threadId: 'thread-1',
      stream: true,
      messages: [user, ...messages],
    }),
  )
  return chunks.filter((chunk) => chunk.type === EventType.ACTIVITY_DELTA)
}

describe('sandbox approval decisions', () => {
  it('sends no delta for a row that already has the decision', async () => {
    expect(await decisionDeltas([approvalRow('granted')])).toEqual([])
  })

  it('sends the delta for a row that is still pending', async () => {
    expect(await decisionDeltas([approvalRow('pending')])).toEqual([
      expect.objectContaining({ messageId: rowId }),
    ])
  })

  it('sends the delta for a row that the server does not have', async () => {
    // The client can have the row, for example without persistence.
    expect(await decisionDeltas([])).toEqual([
      expect.objectContaining({ messageId: rowId }),
    ])
  })

  it('gives the adapter true for a granted row', async () => {
    expect(await adapterApprovals([approvalRow('granted')])).toEqual(
      new Map([[approvalId, true]]),
    )
  })

  it('gives the adapter false for a denied row', async () => {
    expect(await adapterApprovals([approvalRow('denied')])).toEqual(
      new Map([[approvalId, false]]),
    )
  })

  it('gives the adapter no entry for a pending row', async () => {
    expect(await adapterApprovals([approvalRow('pending')])).toEqual(new Map())
  })

  it('keeps the decision of a tool-call part with the same id', async () => {
    expect(
      await adapterApprovals([deniedToolCall, approvalRow('granted')]),
    ).toEqual(new Map([[approvalId, false]]))
  })

  it('reads a decided row from the stored activities', async () => {
    expect(await adapterApprovals([], [storedGrantedRow])).toEqual(
      new Map([[approvalId, true]]),
    )
  })

  it('keeps the decision of a tool-call part over a stored row', async () => {
    expect(
      await adapterApprovals([deniedToolCall], [storedGrantedRow]),
    ).toEqual(new Map([[approvalId, false]]))
  })
})
