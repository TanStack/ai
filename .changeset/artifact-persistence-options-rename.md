---
'@tanstack/ai-persistence': minor
---

The artifact options for `withGenerationPersistence` are now named
`ArtifactPersistenceOptions`.

They were declared as a second `export interface WithPersistenceOptions`, which
TypeScript merged with the chat middleware's options of the same name. The merge
was invisible but not harmless: `withPersistence(chat, …)` silently accepted
`extractArtifacts` / `storageKey` / `allowInputUrl` / `artifactFetch`, and
`WithGenerationPersistenceOptions` — which extends it — advertised
`snapshotStreaming` / `snapshotIntervalMs`. Every one of those is a no-op on the
other middleware, so autocomplete offered options that did nothing.

`WithPersistenceOptions` keeps its meaning: the chat middleware's options.
`WithGenerationPersistenceOptions` is unchanged in shape and is still what you
pass to `withGenerationPersistence`, so only code that named the artifact
interface directly needs an edit:

```diff
-import type { WithPersistenceOptions } from '@tanstack/ai-persistence'
-function artifactOptions(): WithPersistenceOptions {
+import type { ArtifactPersistenceOptions } from '@tanstack/ai-persistence'
+function artifactOptions(): ArtifactPersistenceOptions {
   return { storageKey: ({ runId, artifactId }) => `media/${runId}/${artifactId}` }
 }
```
