import { describe, expect, it, vi } from 'vitest'
import { aggregate, cache, dedupe, filter } from '../src/combinators'
import { inlineSkill } from '../src/sources/inline'
import type { SkillMetadata, SkillSource } from '../src/types'

const alpha = inlineSkill({ name: 'alpha', description: 'a', instructions: 'A' })
const beta = inlineSkill({ name: 'beta', description: 'b', instructions: 'B' })
const alpha2 = inlineSkill({
  name: 'alpha',
  description: 'a2',
  instructions: 'A2',
})

describe('aggregate', () => {
  it('concatenates in order and routes load() to the owner', async () => {
    const s = aggregate([alpha, beta])
    expect((await s.list()).map((x) => x.name)).toEqual(['alpha', 'beta'])
    expect(await s.load('beta')).toBe('B')
  })
})

describe('dedupe', () => {
  it('keeps the first occurrence and warns on collision', async () => {
    const warn = vi.fn()
    const s = dedupe(aggregate([alpha, alpha2]), warn)
    const list = await s.list()
    expect(list).toHaveLength(1)
    expect(warn).toHaveBeenCalledWith('alpha')
  })
})

describe('filter', () => {
  it('hides rejected skills', async () => {
    const s = filter(aggregate([alpha, beta]), (m) => m.name !== 'beta')
    expect((await s.list()).map((x) => x.name)).toEqual(['alpha'])
  })
})

describe('cache', () => {
  it('serves concurrent list() from a single underlying fetch', async () => {
    let calls = 0
    const underlying: SkillSource = {
      list: () => {
        calls++
        const meta: SkillMetadata = { name: 'alpha', description: 'a' }
        return Promise.resolve([meta])
      },
      load: () => Promise.resolve('A'),
    }
    const s = cache(underlying)
    await Promise.all([s.list(), s.list(), s.list()])
    expect(calls).toBe(1)
  })
})
