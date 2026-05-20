import { describe, expect, it } from 'vitest'
import {
  parseWorkflowRequest,
  WorkflowRequestParseError,
} from '../src/server/parse-request'

function mkRequest(body: BodyInit | null): Request {
  return new Request('http://localhost/api/workflow', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  })
}

describe('parseWorkflowRequest', () => {
  it('extracts approval / input / runId / signalDelivery / abort fields', async () => {
    const req = mkRequest(
      JSON.stringify({
        input: { topic: 'hello' },
        runId: 'r1',
        approval: { approvalId: 'a1', approved: true },
        signal: { signalId: 's1', payload: { ok: true } },
        abort: false,
      }),
    )
    const params = await parseWorkflowRequest(req)
    expect(params).toEqual({
      approval: { approvalId: 'a1', approved: true },
      signalDelivery: { signalId: 's1', payload: { ok: true } },
      input: { topic: 'hello' },
      runId: 'r1',
      abort: false,
    })
  })

  it('renames the wire field `signal` to `signalDelivery`', async () => {
    const req = mkRequest(
      JSON.stringify({ runId: 'r1', signal: { signalId: 's', payload: 1 } }),
    )
    const params = await parseWorkflowRequest(req)
    expect(params.signalDelivery).toEqual({ signalId: 's', payload: 1 })
    expect((params as { signal?: unknown }).signal).toBeUndefined()
  })

  it('throws WorkflowRequestParseError on malformed JSON', async () => {
    const req = mkRequest('{not valid json}')
    await expect(parseWorkflowRequest(req)).rejects.toBeInstanceOf(
      WorkflowRequestParseError,
    )
  })

  it('throws WorkflowRequestParseError when body is a JSON string (not an object)', async () => {
    const req = mkRequest(JSON.stringify('hello'))
    await expect(parseWorkflowRequest(req)).rejects.toBeInstanceOf(
      WorkflowRequestParseError,
    )
  })

  it('throws WorkflowRequestParseError when body is a JSON array', async () => {
    const req = mkRequest(JSON.stringify([1, 2, 3]))
    await expect(parseWorkflowRequest(req)).rejects.toBeInstanceOf(
      WorkflowRequestParseError,
    )
  })

  it('preserves the parse cause on WorkflowRequestParseError', async () => {
    const req = mkRequest('{bad}')
    try {
      await parseWorkflowRequest(req)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(WorkflowRequestParseError)
      expect((err as WorkflowRequestParseError).cause).toBeDefined()
    }
  })
})
