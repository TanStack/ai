import { expectTypeOf, test } from 'vitest'
import { createModel } from '@tanstack/ai'
import type { ModelNameOf, ResolveCompatInput } from './types'

const models = [
  'plain-model',
  createModel('reasoner', { input: ['text'], features: ['reasoning'] }),
] as const

test('ModelNameOf unions bare strings and def names', () => {
  expectTypeOf<ModelNameOf<typeof models>>().toEqualTypeOf<'plain-model' | 'reasoner'>()
})

test('ResolveCompatInput uses optimistic default for bare strings', () => {
  expectTypeOf<ResolveCompatInput<typeof models, 'plain-model'>>().toEqualTypeOf<
    readonly ['text', 'image']
  >()
})

test('ResolveCompatInput uses declared input for rich defs', () => {
  expectTypeOf<ResolveCompatInput<typeof models, 'reasoner'>>().toEqualTypeOf<readonly ['text']>()
})
