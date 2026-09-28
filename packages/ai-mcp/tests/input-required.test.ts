import { describe, expect, it } from 'vitest'
import {
  isMCPInputRequiredError,
  MCPInputRequiredError,
} from '../src/input-required'

function expectInputRequired(value: unknown) {
  expect(isMCPInputRequiredError(value)).toBe(true)
  if (!isMCPInputRequiredError(value)) {
    throw new Error('expected MCPInputRequiredError')
  }
  return value
}

describe('MCPInputRequiredError', () => {
  it('keeps the name, form kind, and request after throw and catch', () => {
    const request = { elicitationId: 'elicit-1', message: 'Which city?' }
    let caught: unknown

    try {
      throw new MCPInputRequiredError('form', request)
    } catch (error) {
      caught = error
    }

    const error = expectInputRequired(caught)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(MCPInputRequiredError)
    expect(error.name).toBe('MCPInputRequiredError')
    expect(error.kind).toBe('form')
    expect(error.request).toBe(request)
  })

  it('keeps sampling as a different kind', () => {
    const request = { messages: [{ role: 'user', content: 'Hi' }] }
    let caught: unknown

    try {
      throw new MCPInputRequiredError('sampling', request)
    } catch (error) {
      caught = error
    }

    const error = expectInputRequired(caught)
    expect(error.name).toBe('MCPInputRequiredError')
    expect(error.kind).toBe('sampling')
    expect(error.request).toBe(request)
  })

  it('accepts a plain object with the same shape', () => {
    const request = { elicitationId: 'elicit-2' }
    const plain = {
      name: 'MCPInputRequiredError',
      kind: 'form',
      request,
    }

    expect(plain instanceof MCPInputRequiredError).toBe(false)
    const error = expectInputRequired(plain)
    expect(error.kind).toBe('form')
    expect(error.request).toBe(request)
  })

  it('rejects an ordinary Error and a wrong kind', () => {
    expect(isMCPInputRequiredError(new Error('nope'))).toBe(false)
    expect(isMCPInputRequiredError(null)).toBe(false)
    expect(
      isMCPInputRequiredError({
        name: 'MCPInputRequiredError',
        kind: 'approval',
        request: { elicitationId: 'elicit-3' },
      }),
    ).toBe(false)
    expect(
      isMCPInputRequiredError({
        name: 'TypeError',
        kind: 'form',
        request: { elicitationId: 'elicit-3' },
      }),
    ).toBe(false)
    expect(
      isMCPInputRequiredError({
        name: 'MCPInputRequiredError',
        kind: 'sampling',
      }),
    ).toBe(false)
  })
})
