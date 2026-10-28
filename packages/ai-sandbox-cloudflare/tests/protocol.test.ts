/**
 * Branch tests for {@link parseContainerRunRequest} — the in-container runner's
 * only validation gate for the DO→container `POST /run` body. Pure, no Workers
 * runtime. One happy path + one rejection per guarded field.
 */
import { describe, expect, it } from 'vitest'
import { parseContainerRunRequest } from '../src/protocol'

/** A minimal well-formed request; tests clone + corrupt one field at a time. */
function validBody(): Record<string, unknown> {
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    model: 'sonnet',
    toolExecUrl: 'https://example.com/tool-exec/run-1',
    toolExecToken: 'tok',
    messages: [{ role: 'user', content: 'hi' }],
    harness: 'claude-code',
    workspace: { source: { type: 'local', path: '.' } },
    toolDescriptors: [{ name: 'getTodos' }],
  }
}

describe('parseContainerRunRequest', () => {
  it('parses a well-formed body', () => {
    const parsed = parseContainerRunRequest(validBody())
    expect(parsed.runId).toBe('run-1')
    expect(parsed.harness).toBe('claude-code')
    expect(parsed.messages).toHaveLength(1)
    expect(parsed.toolDescriptors[0]?.name).toBe('getTodos')
  })

  it('rejects a non-object body', () => {
    expect(() => parseContainerRunRequest('nope')).toThrow(/JSON object/)
    expect(() => parseContainerRunRequest(null)).toThrow(/JSON object/)
  })

  it.each(['runId', 'threadId', 'model', 'toolExecUrl', 'toolExecToken'])(
    'rejects a missing/empty %s',
    (field) => {
      const body = validBody()
      body[field] = ''
      expect(() => parseContainerRunRequest(body)).toThrow(new RegExp(field))
    },
  )

  it('rejects empty / non-array messages', () => {
    const empty = { ...validBody(), messages: [] }
    expect(() => parseContainerRunRequest(empty)).toThrow(/messages/)
    const notArray = { ...validBody(), messages: 'x' }
    expect(() => parseContainerRunRequest(notArray)).toThrow(/messages/)
  })

  it('rejects a malformed message element', () => {
    const body = { ...validBody(), messages: [{ role: 'user' }] } // no content
    expect(() => parseContainerRunRequest(body)).toThrow(/messages/)
  })

  it('rejects an unknown harness id', () => {
    const body = { ...validBody(), harness: 'not-a-harness' }
    expect(() => parseContainerRunRequest(body)).toThrow(/harness/)
  })

  it('rejects a non-WorkspaceDefinition workspace', () => {
    const body = { ...validBody(), workspace: { nope: true } }
    expect(() => parseContainerRunRequest(body)).toThrow(/workspace/)
  })

  it('rejects non-ToolDescriptor[] toolDescriptors', () => {
    const body = { ...validBody(), toolDescriptors: [{ noName: true }] }
    expect(() => parseContainerRunRequest(body)).toThrow(/toolDescriptors/)
  })
})
