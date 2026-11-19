import { describe, expect, it } from 'vitest'
import { makeRef } from './stash'

describe('makeRef', () => {
  it('is injective across paths that a lossy slug would collide', () => {
    const paths = ['a.b', 'a_b', 'a-b', 'a b', '$', 'root', 'a/b', 'a.b.c']
    const refs = paths.map((p) => makeRef('call1', p, 'result'))
    expect(new Set(refs).size).toBe(paths.length)
  })

  it('keeps the readable `root` spelling for the whole-result sentinel', () => {
    expect(makeRef('c', '$', 'result')).toBe('ctx_c_result_root')
  })

  it('escapes a literal field named `root` so it cannot alias the sentinel', () => {
    expect(makeRef('c', 'root', 'result')).not.toBe(makeRef('c', '$', 'result'))
  })

  it('separates result and args origins for the same path', () => {
    expect(makeRef('c', 'x', 'result')).not.toBe(makeRef('c', 'x', 'args'))
  })
})
