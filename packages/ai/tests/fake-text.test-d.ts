import { expectTypeOf } from 'vitest'
import { fakeText } from '../src/testing'

// `inputModalities` is optional, as on `TextAdapter`. A required
// `X | undefined` field breaks `chat({ adapter: fakeText() })` in a project
// with `exactOptionalPropertyTypes`.
type Fake = ReturnType<typeof fakeText>
expectTypeOf<
  {} extends Pick<Fake, 'inputModalities'> ? true : false
>().toEqualTypeOf<true>()
