import { expectTypeOf, test } from 'vitest'
import { createModel } from './extend-adapter'
import type { ExtendedModelDef } from './extend-adapter'

test('createModel(name, inputArray) still infers name + input (backward compat)', () => {
  const m = createModel('legacy-model', ['text', 'image'])
  expectTypeOf(m.name).toEqualTypeOf<'legacy-model'>()
  expectTypeOf(m.input).toEqualTypeOf<readonly ['text', 'image']>()
})

test('createModel(name, capabilities) captures features and tools', () => {
  const m = createModel('reasoner', {
    input: ['text'],
    features: ['reasoning', 'structured_outputs'],
    tools: ['web_search'],
  })
  expectTypeOf(m.name).toEqualTypeOf<'reasoner'>()
  expectTypeOf(m.input).toEqualTypeOf<readonly ['text']>()
  expectTypeOf(m.features).toEqualTypeOf<
    readonly ['reasoning', 'structured_outputs'] | undefined
  >()
  expectTypeOf(m.tools).toEqualTypeOf<readonly ['web_search'] | undefined>()
})

test('a capabilities-form model is still an ExtendedModelDef', () => {
  const m = createModel('reasoner', { input: ['text'] })
  expectTypeOf(m).toMatchTypeOf<ExtendedModelDef>()
})
