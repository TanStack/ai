import { expectTypeOf } from 'vitest'
import type { ChatStream, KnownCustomEvent, SessionIdEvent } from '../src/types'

// A KnownCustomEvent narrowed by literal name yields the concrete value.
declare const ev: KnownCustomEvent
if (ev.name === 'sandbox.file.diff') {
  expectTypeOf(ev.value).toEqualTypeOf<{ path: string; diff: string }>()
}
if (ev.name === 'code_mode:console') {
  expectTypeOf(ev.value.level).toEqualTypeOf<
    'log' | 'warn' | 'error' | 'info'
  >()
}
// `String.prototype.endsWith` is not a TS control-flow narrowing construct
// (unlike `===`, `in`, `typeof`, `instanceof`), so a plain
// `ev.name.endsWith('.session-id')` guard does not narrow the union — a
// user-defined type predicate is required to prove the template-literal
// member narrows correctly.
function isSessionIdEvent(e: KnownCustomEvent): e is SessionIdEvent {
  return e.name.endsWith('.session-id')
}
if (isSessionIdEvent(ev)) {
  expectTypeOf(ev.value).toEqualTypeOf<{ sessionId: string }>()
}

async function narrowsOnRealStream(stream: ChatStream) {
  for await (const chunk of stream) {
    if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file') {
      expectTypeOf(chunk.value.path).toEqualTypeOf<string>()
    }
  }
}
void narrowsOnRealStream
