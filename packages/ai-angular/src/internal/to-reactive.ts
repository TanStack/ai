import { computed, isSignal } from '@angular/core'
import type { Signal } from '@angular/core'

/**
 * A value that may be supplied to `injectChat` either as a static value, an
 * Angular `Signal`, or a zero-arg getter. The getter form lets callers read
 * other signals so the option stays reactive.
 */
export type ReactiveOption<T> = T | Signal<T> | (() => T)

/**
 * Normalize a {@link ReactiveOption} into a `Signal`-like getter `() => T`.
 *
 * - A `Signal` is returned as-is (already a getter that tracks reads).
 * - A zero-arg function is wrapped in `computed` so reads inside it are tracked.
 * - A plain value becomes a constant non-reactive fn (never re-fires).
 */
export function toReactive<T>(value: ReactiveOption<T>): () => T {
  if (isSignal(value)) {
    return value
  }
  if (typeof value === 'function') {
    return computed(value as () => T)
  }
  return () => value
}
