---
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
---

fix(persistence): stop charging every adapter for sandbox-only run fields

`runPersistenceConformance` required every backend to round-trip four fields that
only durable sandboxed runs use: `sandboxKey`, `detachedSince`, `cancelRequested`
and `driverEpoch`, including the rule that an omitted patch key means "leave the
column" while an explicit `undefined` means "clear it". The case was deliberately
non-skippable, so a Postgres adapter for a plain chat app failed conformance until it
implemented four columns nothing in its stack would ever write.

The assertions moved rather than disappeared. `runDurableRunFieldsConformance` now
ships from `@tanstack/ai-sandbox/testkit`, beside the takeover and reaper suites that
consume those fields, and takes the same `runs` store:

```ts
import { runDurableRunFieldsConformance } from '@tanstack/ai-sandbox/testkit'
import { persistence } from './persistence'

runDurableRunFieldsConformance(
  'my postgres runs',
  () => persistence.stores.runs,
)
```

So a chat-only backend leaves those columns out of its schema and passes, and an app
that wires `withSandbox(sandbox, { runs, durability })` proves them with one extra
line. The fields were already optional on `RunRecord` and `listReclaimable` was
already optional and feature-detected; the conformance suite was the only thing making
them mandatory in practice.

Docs follow the same split. The fields are explained where they are used, on
`persistence/build-a-sandbox-adapter` ("The four run fields", with the failure each
omission causes), and `persistence/store-reference` marks them sandbox-only and points
there instead of teaching them inline. The chat walkthrough's `runs` example labels
them SANDBOX ONLY, since a reader following it for a chat app should skip them.
