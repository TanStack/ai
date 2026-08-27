import { computed, isSignal } from '@angular/core'
import type { Signal } from '@angular/core'

export type ReactiveOption<T> = T | Signal<T> | (() => T)

export function toReactive<T>(value: ReactiveOption<T>): () => T {
  if (isSignal(value)) {
    return value
  }
  if (typeof value === 'function') {
    return computed(value as () => T)
  }
  return () => value
}
