import { expectTypeOf } from 'vitest'
import { fakeText } from '../src/testing'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'

// The fake is a text adapter, and keeps the model id as a literal type.
expectTypeOf(fakeText()).toExtend<AnyTextAdapter>()
expectTypeOf(fakeText().model).toEqualTypeOf<'fake-model'>()
expectTypeOf(fakeText({ model: 'my-model' }).model).toEqualTypeOf<'my-model'>()
