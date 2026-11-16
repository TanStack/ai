import { describe, expect, it } from 'vitest'
import { wrapCode } from '../src/code-wrapper'

describe('wrapCode', () => {
  it('wraps user code in async IIFE', () => {
    const code = 'return 42'
    const result = wrapCode(code)
    expect(result).toContain('(async function()')
    expect(result).toContain(code)
    expect(result).toContain('JSON.stringify(__userResult)')
  })

  it('preserves user code with proper indentation', () => {
    const code = 'const x = 1\nreturn x'
    const result = wrapCode(code)
    expect(result).toContain('const x = 1')
    expect(result).toContain('return x')
  })

  it('includes try/catch for error propagation', () => {
    const result = wrapCode('throw new Error("oops")')
    expect(result).toContain('try {')
    expect(result).toContain('catch (__error)')
    expect(result).toContain('throw __error')
  })
})
