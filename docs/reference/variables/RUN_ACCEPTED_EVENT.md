---
id: RUN_ACCEPTED_EVENT
title: RUN_ACCEPTED_EVENT
---

# Variable: RUN\_ACCEPTED\_EVENT

```ts
const RUN_ACCEPTED_EVENT: "run.accepted" = 'run.accepted';
```

Defined in: [packages/ai/src/stream-to-response.ts:361](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-to-response.ts#L361)

Name of the synthetic `CUSTOM` chunk a fresh durable producer appends to its
log before pulling the first real chunk.

Flushing `RUN_STARTED` (above) makes a run joinable from the instant the
stream EMITS something — but a `chat()` whose middleware boots a sandbox
(create a container, install a CLI) legitimately emits nothing for minutes,
and during that window the log is empty. Every joiner's empty-log fail-fast
(`memoryStream`'s first-chunk deadline, the client's rejoin connect deadline)
then reads the run as gone — and the client clears its resume pointer, so a
reload during the boot window permanently orphans a run that is still going.

This marker closes the window: it is appended (and flushed) before the
producer stream is first pulled, so a join always finds a first chunk within
milliseconds of the run being accepted. Takeover alignment is unaffected — a
journal replay cannot reproduce the marker, and alignment already skips
stored `CUSTOM` chunks as out-of-band for exactly that reason (see
`isBridgeCustomChunk` in `@tanstack/ai-sandbox`).
