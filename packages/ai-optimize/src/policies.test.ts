import { describe, expect, it } from 'vitest'
import { PolicyResolver } from './policies'
import {
  truncateHead,
  truncateTail,
  truncateHeadTail,
  dropWithRef,
} from './builders'
import { must } from './test-helpers'
import type { PolicyTool } from './policies'

const authored: PolicyTool = {
  name: 'read_file',
  context: {
    result: { fields: { content: truncateTail({ maxTokens: 500 }) } },
  },
}

describe('PolicyResolver precedence (§5.4)', () => {
  it('1. exclude beats everything', () => {
    const r = new PolicyResolver({
      exclude: ['read_file'],
      defaults: { projection: truncateHeadTail() },
      tools: { read_file: { result: { fields: { content: truncateHead() } } } },
    })
    expect(r.result(authored)).toBeUndefined()
  })

  it('2. author optimization wins over optimize per-tool override for that field', () => {
    const r = new PolicyResolver({
      tools: { read_file: { result: { fields: { content: truncateHead() } } } },
    })
    const policy = must(r.result(authored))
    // Author said 'tail' / maxTokens 500 — the override's 'head' must not win.
    expect(must(policy.fields.content).truncate).toBe('tail')
    expect(must(policy.fields.content).maxTokens).toBe(500)
  })

  it('3. optimize per-tool override applies where the author is silent', () => {
    const r = new PolicyResolver({
      tools: { read_file: { result: { fields: { other: dropWithRef() } } } },
    })
    const policy = must(r.result(authored))
    expect(must(policy.fields.content).truncate).toBe('tail') // author
    expect(must(policy.fields.other).truncate).toBe('drop_with_ref') // override
  })

  it('4. universal defaults apply to result fields (leaves mode default)', () => {
    const r = new PolicyResolver({
      defaults: { projection: truncateHeadTail({ maxTokens: 900 }) },
    })
    const policy = must(r.result({ name: 'foreign' }))
    expect(policy.default).toEqual({
      mode: 'leaves',
      projection: {
        truncate: 'head_tail',
        aboveTokens: 1500,
        maxTokens: 900,
        retrievable: true,
      },
    })
  })

  it('5. no rule → no projection', () => {
    const r = new PolicyResolver({})
    expect(r.result({ name: 'foreign' })).toBeUndefined()
  })

  it('args rules are optimize()-only and forbidden on needsApproval tools', () => {
    const r = new PolicyResolver({
      tools: {
        write_file: { args: { fields: { content: dropWithRef() } } },
        approve_me: { args: { fields: { content: dropWithRef() } } },
      },
    })
    expect(
      must(must(r.args({ name: 'write_file' })).fields.content).truncate,
    ).toBe('drop_with_ref')
    expect(r.args({ name: 'approve_me', needsApproval: true })).toBeUndefined()
  })

  it('retrieve_context results are always exempt', () => {
    const r = new PolicyResolver({
      defaults: { projection: truncateHeadTail() },
    })
    expect(r.result({ name: 'retrieve_context' })).toBeUndefined()
  })

  it('anyRetrievable reflects whether retrieve_context should be injected', () => {
    const retrievable = new PolicyResolver({
      defaults: { projection: truncateHeadTail() },
    })
    expect(retrievable.anyRetrievable([{ name: 'foreign' }])).toBe(true)

    const notRetrievable = new PolicyResolver({
      tools: {
        foreign: {
          result: { fields: { x: truncateHead({ retrievable: false }) } },
        },
      },
    })
    expect(notRetrievable.anyRetrievable([{ name: 'foreign' }])).toBe(false)
  })

  it('a retrievable default needs retrieve_context even with no current tools', () => {
    // Defaults apply to historical results too, so the tool may be gone from
    // the set while its projected result still references retrieve_context.
    const r = new PolicyResolver({ defaults: { projection: dropWithRef() } })
    expect(r.anyRetrievable([])).toBe(true)

    const nonRetrievable = new PolicyResolver({
      defaults: { projection: dropWithRef({ retrievable: false }) },
    })
    expect(nonRetrievable.anyRetrievable([])).toBe(false)
  })
})
