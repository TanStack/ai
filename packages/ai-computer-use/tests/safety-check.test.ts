import { describe, expect, it } from 'vitest'
import { computerSafetyCheck } from '../src/safety-check'

const payload = {
  checks: [
    { id: 'sc_1', code: 'malicious_instructions', message: 'Check the page.' },
    { id: 'sc_2', code: null, message: null },
  ],
  action: { type: 'click', x: 10, y: 20, button: 'left' },
}

describe('computerSafetyCheck', () => {
  it('builds a request with the OpenAI checks and the action', () => {
    const request = computerSafetyCheck.interrupt({
      key: 'call_1',
      reason: 'computer-safety-check',
      message: 'Check the page.',
      payload,
    })

    expect(request.key).toBe('call_1')
    expect(request.payload).toEqual(payload)
  })

  it('rejects a check without an id', () => {
    const validate = computerSafetyCheck.payloadSchema['~standard'].validate

    expect(validate({ checks: [{ code: 'x' }], action: {} })).toHaveProperty(
      'issues',
    )
  })

  it('accepts an approval and rejects a response without one', () => {
    const validate = computerSafetyCheck.responseSchema['~standard'].validate

    expect(validate({ approved: true })).toEqual({ value: { approved: true } })
    expect(validate({})).toHaveProperty('issues')
  })

  it('exports both schemas as JSON Schema', () => {
    expect(
      computerSafetyCheck.responseSchema['~standard'].jsonSchema.input({
        target: 'draft-07',
      }),
    ).toMatchObject({
      type: 'object',
      properties: { approved: { type: 'boolean' } },
      required: ['approved'],
    })
    expect(
      computerSafetyCheck.payloadSchema['~standard'].jsonSchema.input({
        target: 'draft-07',
      }),
    ).toMatchObject({
      type: 'object',
      properties: {
        checks: {
          type: 'array',
          items: { type: 'object', required: ['id'] },
        },
      },
      required: ['checks', 'action'],
    })
  })
})
