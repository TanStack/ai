import { expectTypeOf } from 'vitest'
import type { KnownCustomEvent, SessionIdEvent } from '../src/types'

// A KnownCustomEvent narrowed by literal name yields the concrete value.
declare const ev: KnownCustomEvent
if (ev.type === 'CUSTOM' && ev.name === 'sandbox.file.diff') {
  expectTypeOf(ev.value).toEqualTypeOf<{ path: string; diff: string }>()
}
if (ev.type === 'CUSTOM' && ev.name === 'code_mode:console') {
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
if (ev.type === 'CUSTOM' && isSessionIdEvent(ev)) {
  expectTypeOf(ev.value).toEqualTypeOf<{ sessionId: string }>()
}
