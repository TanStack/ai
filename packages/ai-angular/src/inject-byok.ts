import {
  DestroyRef,
  assertInInjectionContext,
  inject,
  signal,
} from '@angular/core'
import type { Signal } from '@angular/core'
import type { ByokClient, ByokSnapshot } from '@tanstack/ai-client/byok'

export function injectByok(client: ByokClient): Signal<ByokSnapshot> {
  assertInInjectionContext(injectByok)
  const destroyRef = inject(DestroyRef)
  const snapshot = signal(client.getSnapshot())
  const unsubscribe = client.subscribe(() => {
    snapshot.set(client.getSnapshot())
  })
  destroyRef.onDestroy(unsubscribe)
  return snapshot.asReadonly()
}
