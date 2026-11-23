import { describe, expect, it } from 'vitest'
import type { ContentPart } from '@tanstack/ai'
import {
  projectToolCallArgs,
  projectToolResult,
  truncateValue,
} from './project'
import { createStash } from './stash'
import { at, must } from './test-helpers'
import type { ResolvedFieldProjection, ResolvedResultPolicy } from './types'

const HEAD_TAIL: ResolvedFieldProjection = {
  truncate: 'head_tail',
  aboveTokens: 1500,
  maxTokens: 750,
  retrievable: true,
}

// 8000 chars of text → ~2000 tokens (div 4). budget = 750*4 = 3000 chars;
// head = floor(3000*0.6) = 1800, tail = floor(3000*0.4) = 1200.
const big = 'H'.repeat(4000) + 'T'.repeat(4000)
const headChunk = 'H'.repeat(1800)
const tailChunk = 'T'.repeat(1200)

function resultPolicy(
  fields: Record<string, ResolvedFieldProjection>,
  extra?: Partial<ResolvedResultPolicy>,
): ResolvedResultPolicy {
  return { fields, includeErrors: false, ...extra }
}

describe('truncateValue golden markers', () => {
  it('head_tail: exact marker + 60/40 split', () => {
    const stash = createStash()
    const res = truncateValue({
      raw: big,
      projection: HEAD_TAIL,
      origin: 'result',
      fieldPath: '$',
      toolName: 'read',
      toolCallId: 'call1',
      stash,
    })
    expect(res).not.toBeNull()
    expect(must(res).value).toBe(
      `[Truncated for context: $, ~2000 tokens, kept ~750. Full content: retrieve_context(ref="ctx_call1_result_root")]\n\n` +
        `${headChunk}\n\n[... 5000 chars elided ...]\n\n${tailChunk}`,
    )
    expect(must(res).event).toEqual({
      type: 'projected',
      toolName: 'read',
      toolCallId: 'call1',
      origin: 'result',
      fieldPath: '$',
      strategy: 'head_tail',
      originalTokens: 2000,
      keptTokens: 750,
      ref: 'ctx_call1_result_root',
    })
    // The ORIGINAL value is stashed, verbatim.
    expect(must(stash.get('ctx_call1_result_root')).value).toBe(big)
  })

  it('head: keeps the head, elides the tail', () => {
    const res = truncateValue({
      raw: big,
      projection: { ...HEAD_TAIL, truncate: 'head' },
      origin: 'result',
      fieldPath: '$',
      toolName: 'read',
      toolCallId: 'c',
      stash: createStash(),
    })
    const head = big.slice(0, 3000)
    expect(must(res).value).toBe(
      `[Truncated for context: $, ~2000 tokens, kept ~750. Full content: retrieve_context(ref="ctx_c_result_root")]\n\n` +
        `${head}\n\n[... 5000 chars elided ...]`,
    )
  })

  it('tail: keeps the tail, elides the head', () => {
    const res = truncateValue({
      raw: big,
      projection: { ...HEAD_TAIL, truncate: 'tail' },
      origin: 'result',
      fieldPath: '$',
      toolName: 'read',
      toolCallId: 'c',
      stash: createStash(),
    })
    const tail = big.slice(big.length - 3000)
    expect(must(res).value).toBe(
      `[Truncated for context: $, ~2000 tokens, kept ~750. Full content: retrieve_context(ref="ctx_c_result_root")]\n\n` +
        `[... 5000 chars elided ...]\n\n${tail}`,
    )
  })

  it('drop_with_ref: marker only', () => {
    const res = truncateValue({
      raw: big,
      projection: { ...HEAD_TAIL, truncate: 'drop_with_ref' },
      origin: 'result',
      fieldPath: 'body',
      toolName: 'fetch',
      toolCallId: 'c2',
      stash: createStash(),
    })
    expect(must(res).value).toBe(
      `[Dropped for context: body, ~2000 tokens. Full content: retrieve_context(ref="ctx_c2_result_body")]`,
    )
    const ev = must(res).event
    expect(ev.type === 'projected' && ev.keptTokens).toBe(0)
  })

  it('retrievable: false omits the Full content sentence and does not stash', () => {
    const stash = createStash()
    const res = truncateValue({
      raw: big,
      projection: { ...HEAD_TAIL, retrievable: false },
      origin: 'result',
      fieldPath: '$',
      toolName: 'read',
      toolCallId: 'c',
      stash,
    })
    expect(
      must(res).value.startsWith(
        '[Truncated for context: $, ~2000 tokens, kept ~750.]',
      ),
    ).toBe(true)
    expect(stash.size).toBe(0)
    const ev = must(res).event
    expect(ev.type === 'projected' && ev.ref).toBeUndefined()
  })

  it('below threshold: no-op', () => {
    const res = truncateValue({
      raw: 'small',
      projection: HEAD_TAIL,
      origin: 'result',
      fieldPath: '$',
      toolName: 't',
      toolCallId: 'c',
      stash: createStash(),
    })
    expect(res).toBeNull()
  })

  it('projection-not-smaller: no-op (and un-stashes)', () => {
    const stash = createStash()
    // Over threshold but a tiny maxTokens budget still can shrink; craft a case
    // where the marker would be longer than the content by using drop on a
    // value barely over threshold.
    const barely = 'x'.repeat(6004) // ~1501 tokens
    const res = truncateValue({
      raw: barely,
      projection: {
        truncate: 'drop_with_ref',
        aboveTokens: 1500,
        maxTokens: 750,
        retrievable: true,
      },
      origin: 'result',
      fieldPath: 'a-very-long-field-path-that-would-blow-up-the-marker'.repeat(
        200,
      ),
      toolName: 't',
      toolCallId: 'c',
      stash,
    })
    expect(res).toBeNull()
    expect(stash.size).toBe(0)
  })

  it('idempotence: a value already projected is returned unchanged', () => {
    const projected =
      '[Truncated for context: $, ~2000 tokens, kept ~750. Full content: retrieve_context(ref="ctx_c_result_root")]\n\nx'
    const res = truncateValue({
      raw: projected,
      projection: HEAD_TAIL,
      origin: 'result',
      fieldPath: '$',
      toolName: 't',
      toolCallId: 'c',
      stash: createStash(),
    })
    expect(res).toBeNull()
  })
})

describe('projectToolResult', () => {
  it('structured output: optimized field truncated, siblings byte-identical', () => {
    const output = { id: 'abc-123', big, count: 5, nested: { keep: 'yes' } }
    const policy = resultPolicy({ big: HEAD_TAIL })
    const { content, events } = projectToolResult({
      toolName: 'read',
      toolCallId: 'call1',
      state: 'complete',
      content: JSON.stringify(output),
      output,
      policy,
      stash: createStash(),
    })
    expect(events).toHaveLength(1)
    const parsed = JSON.parse(content as string)
    expect(parsed.id).toBe('abc-123')
    expect(parsed.count).toBe(5)
    expect(parsed.nested).toEqual({ keep: 'yes' })
    expect(parsed.big.startsWith('[Truncated for context: big,')).toBe(true)
  })

  it('leaves default: oversized string leaves truncated, short leaves survive', () => {
    const output = { a: big, b: 'short', id: 'x' }
    const policy = resultPolicy(
      {},
      { default: { mode: 'leaves', projection: HEAD_TAIL } },
    )
    const { content, events } = projectToolResult({
      toolName: 't',
      toolCallId: 'c',
      state: 'complete',
      content: JSON.stringify(output),
      output,
      policy,
      stash: createStash(),
    })
    expect(events).toHaveLength(1)
    const parsed = JSON.parse(content as string)
    expect(parsed.a.startsWith('[Truncated')).toBe(true)
    expect(parsed.b).toBe('short')
    expect(parsed.id).toBe('x')
  })

  it('flatten default: whole result serialized and truncated as one string', () => {
    const output = { a: 'X'.repeat(4000), b: 'Y'.repeat(4000) }
    const policy = resultPolicy(
      {},
      { default: { mode: 'flatten', projection: HEAD_TAIL } },
    )
    const { content, events } = projectToolResult({
      toolName: 't',
      toolCallId: 'c',
      state: 'complete',
      content: JSON.stringify(output),
      output,
      policy,
      stash: createStash(),
    })
    expect(events).toHaveLength(1)
    expect(typeof content).toBe('string')
    expect((content as string).startsWith('[Truncated for context: $,')).toBe(
      true,
    )
  })

  it('flatten default still honors an explicit field rule (author wins)', () => {
    const output = { body: big, note: 'Y'.repeat(4000) }
    // Author drops `body` and forbids stashing it; consumer adds a retrievable
    // flatten default. The author rule must still apply, and body must not be
    // re-stashed by the flatten pass.
    const policy = resultPolicy(
      {
        body: {
          truncate: 'drop_with_ref',
          aboveTokens: 1500,
          maxTokens: 750,
          retrievable: false,
        },
      },
      { default: { mode: 'flatten', projection: HEAD_TAIL } },
    )
    const stash = createStash()
    const { content, events } = projectToolResult({
      toolName: 'fetch',
      toolCallId: 'c',
      state: 'complete',
      content: JSON.stringify(output),
      output,
      policy,
      stash,
    })
    // body (explicit drop) + $ (flatten) both projected.
    expect(events.map((e) => e.fieldPath).sort()).toEqual(['$', 'body'])
    expect((content as string).startsWith('[Truncated for context: $,')).toBe(
      true,
    )
    // body was retrievable:false, so only the flatten `$` original is stashed.
    expect([...stash.keys()]).toEqual(['ctx_c_result_root'])
  })

  it('opaque content parts pass through after the preview', () => {
    const parts: Array<ContentPart> = [
      { type: 'text', content: big },
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- opaque image part stub for the pass-through test
      {
        type: 'image',
        source: { type: 'url', url: 'https://x/y.png' },
      } as unknown as ContentPart,
    ]
    const policy = resultPolicy({ $: HEAD_TAIL })
    const { content, events } = projectToolResult({
      toolName: 't',
      toolCallId: 'c',
      state: 'complete',
      content: parts,
      output: undefined,
      policy,
      stash: createStash(),
    })
    expect(events).toHaveLength(1)
    const arr = content as Array<ContentPart>
    expect(arr).toHaveLength(2)
    expect(at(arr, 0).type).toBe('text')
    expect(
      (arr[0] as { content: string }).content.startsWith('[Truncated'),
    ).toBe(true)
    expect(at(arr, 1).type).toBe('image')
  })

  it('error results are exempt unless includeErrors', () => {
    const policy = resultPolicy({ $: HEAD_TAIL })
    const exempt = projectToolResult({
      toolName: 't',
      toolCallId: 'c',
      state: 'error',
      content: big,
      output: big,
      policy,
      stash: createStash(),
    })
    expect(exempt.events).toHaveLength(0)
    expect(exempt.content).toBe(big)

    const opted = projectToolResult({
      toolName: 't',
      toolCallId: 'c',
      state: 'error',
      content: big,
      output: big,
      policy: resultPolicy({ $: HEAD_TAIL }, { includeErrors: true }),
      stash: createStash(),
    })
    expect(opted.events).toHaveLength(1)
  })
})

describe('projectToolCallArgs', () => {
  it('projects optimized arg leaves, keeps args an object, siblings intact', () => {
    const args = { content: big, path: '/tmp/f' }
    const { args: out, events } = projectToolCallArgs({
      toolName: 'write_file',
      toolCallId: 'c',
      args,
      policy: {
        fields: {
          content: {
            truncate: 'drop_with_ref',
            aboveTokens: 1500,
            maxTokens: 750,
            retrievable: true,
          },
        },
      },
      stash: createStash(),
    })
    expect(events).toHaveLength(1)
    expect(typeof out).toBe('object')
    const o = out as { content: string; path: string }
    expect(o.path).toBe('/tmp/f')
    expect(o.content.startsWith('[Dropped for context: content,')).toBe(true)
  })
})
