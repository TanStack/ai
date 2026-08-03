---
'@tanstack/ai-persistence': minor
---

Add per-store typer helpers: `defineMessageStore`, `defineRunStore`,
`defineInterruptStore`, `defineMetadataStore`.

Each takes a store implementation and returns it typed against the contract, so
you get autocomplete and checking on the object literal inline — no separate
`: MessageStore` return annotation. They compose into `defineAIPersistence`,
which already infers **exact presence**: a store you define is a defined,
non-optional, autocompleted key on `persistence.stores`, and accessing a store
you did not define is a compile error.

```ts
import {
  defineAIPersistence,
  defineMessageStore,
  defineRunStore,
} from '@tanstack/ai-persistence'

const persistence = defineAIPersistence({
  stores: {
    messages: defineMessageStore({ loadThread, saveThread }),
    runs: defineRunStore({ createOrResume, update, get, findActiveRun }),
  },
})

persistence.stores.runs // RunStore (defined)
persistence.stores.interrupts // compile error — not provided
```
