import { describe, expect, it } from 'vitest'
import { EVALUATE_REFUSAL_CODE, EvaluateError, isEvaluateError } from '../src'
import * as adapters from '../src/activities/index'
import { toRunErrorPayload } from '../src/activities/error-payload'

describe('EvaluateError', () => {
  it('carries the code, usage, model and answers it was built with', () => {
    const usage = { promptTokens: 40, completionTokens: 5, totalTokens: 45 }
    const answers = { tone: { type: 'noul' as const, noul: 0.9 } }
    const error = new EvaluateError({
      message: 'OpenAI declined to answer question "refund"',
      code: EVALUATE_REFUSAL_CODE,
      usage,
      model: 'gpt-5-mini',
      answers,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('EvaluateError')
    expect(error.message).toBe('OpenAI declined to answer question "refund"')
    expect(error.code).toBe('refusal')
    expect(error.usage).toBe(usage)
    expect(error.model).toBe('gpt-5-mini')
    expect(error.answers).toBe(answers)
    expect(toRunErrorPayload(error).code).toBe('refusal')
  })
})

describe('isEvaluateError', () => {
  it('accepts an EvaluateError after throw and catch', () => {
    let caught: unknown

    try {
      throw new EvaluateError({
        message: 'refused',
        code: EVALUATE_REFUSAL_CODE,
      })
    } catch (error) {
      caught = error
    }

    expect(isEvaluateError(caught)).toBe(true)
    expect(caught).toBeInstanceOf(EvaluateError)
  })

  it('accepts an error from another copy of the class', () => {
    class OtherCopyEvaluateError extends Error {
      readonly code = EVALUATE_REFUSAL_CODE
      constructor() {
        super('refused')
        this.name = 'EvaluateError'
      }
    }
    const other = new OtherCopyEvaluateError()

    expect(other instanceof EvaluateError).toBe(false)
    expect(isEvaluateError(other)).toBe(true)
  })

  it('accepts a plain object with the same shape', () => {
    const plain = { name: 'EvaluateError', code: 'refusal' }

    expect(isEvaluateError(plain)).toBe(true)
  })

  it('rejects an ordinary Error, non-objects and a wrong code', () => {
    expect(isEvaluateError(new Error('nope'))).toBe(false)
    expect(isEvaluateError(null)).toBe(false)
    expect(isEvaluateError(undefined)).toBe(false)
    expect(isEvaluateError('EvaluateError')).toBe(false)
    expect(isEvaluateError(42)).toBe(false)
    expect(isEvaluateError({ name: 'EvaluateError' })).toBe(false)
    expect(isEvaluateError({ name: 'EvaluateError', code: 7 })).toBe(false)
    expect(isEvaluateError({ name: 'TypeError', code: 'refusal' })).toBe(false)
  })

  it('is exported from the adapters entry point', () => {
    expect(adapters.isEvaluateError).toBe(isEvaluateError)
  })
})
