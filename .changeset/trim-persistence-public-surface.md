---
'@tanstack/ai-client': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-angular': minor
---

**Breaking:** trim the persistence public API down to what an app actually calls.

Generation persistence is server-driven, so the types and options that only
existed to support a client-managed copy of a run are gone.

- **`initialResumeSnapshot` is removed from every generation hook** (`useGeneration`,
  `useGenerateImage`, `useGenerateVideo`, `useGenerateAudio`, `useGenerateSpeech`,
  `useSummarize`, `useTranscription`, and the Solid / Vue / Svelte / Angular
  equivalents) and from `GenerationClient` / `VideoGenerationClient`. A run is
  restored by `persistence: true` plus a `hydrateGeneration` handler. **`useChat`
  keeps its `initialResumeSnapshot`.**
- **No longer exported from `@tanstack/ai-client`** (they are internals of the
  hydration path): `GenerationResumeSnapshot`, `GenerationResumeState`,
  `GenerationResumeStatus`, `GenerationResultSnapshot`, `GenerationErrorSnapshot`,
  `GenerationEventSnapshot`, `GenerationPendingArtifact`,
  `parseGenerationResumeSnapshot`, `updateGenerationResumeSnapshot`, and
  `ChatResumeSnapshot`. `GenerationPersistenceOption` (an alias for `boolean`) is
  deleted; write `persistence?: boolean`. `GenerationPersistenceOptions`, the
  union that requires a `threadId` alongside `persistence`, is unchanged.
- **`ChatResumeSnapshotV1` / `ChatResumeSnapshotV2` are collapsed into one shape**
  with no `schemaVersion` field. The two versions were structurally identical, no
  reader branched on the version, and only V2 was ever written.
- **The framework packages no longer re-export `PersistedArtifactRef`.** No hook
  type refers to it; import it from `@tanstack/ai` where the artifact stores are
  defined.
- **`artifactBlobKey` is no longer exported from `@tanstack/ai-persistence`.** Use
  `resolveArtifactBlobKey(record)`, which its own docs already recommended for
  reads, since a record written with a custom `storageKey` carries its real key.
- **`createInterruptController` and `InterruptController` are deleted.** The
  controller only forwarded five calls to the `interrupts` store; call the store
  directly (`persistence.stores.interrupts`).
- The ctx-capability plumbing (`PersistenceCapability`, `InterruptsCapability`,
  `getPersistence`, `providePersistence`, `getInterrupts`, `provideInterrupts`) is
  unchanged and now documented, for middleware that reads the stores
  `withPersistence` holds. See
  [Persistence internals](https://tanstack.com/ai/latest/docs/persistence/internals).
