---
'@tanstack/ai-sandbox-local-process': patch
---

`localProcessSandbox` no longer leaks a process per killed command on Windows.

`killTree` ran `taskkill /PID <sh> /T /F` and returned as soon as `spawnSync`
reported no `error` — treating "I successfully asked" as "it died". Two things
were wrong with that, and the second is the one that actually leaked.

**It never checked taskkill's exit status.** A launched taskkill is not a
successful taskkill. A genuine refusal (access denied, a protected process) was
indistinguishable from a kill that worked.

**`taskkill /T` cannot reach the process anyway.** Commands run through a
git-bash `sh`, and MSYS's fork emulation runs the final command of a statement
list — such as the `tail -f` behind a journal follow read — under an intermediate
shell that immediately exits. Windows never reparents, so the surviving
`tail.exe` points at a dead parent, and `taskkill /T` walks only live parent
links. It misses the process **and still exits `0`**, which is why checking the
exit status alone would not have caught this either. Measured on Windows 11: the
journal conformance suite leaked 2 processes per run and the takeover suite 4,
accumulating for the life of the machine. Streaming was unaffected (the reader
honors its own `AbortSignal` rather than waiting for the kill), so it failed
silently and cumulatively and no test ever went red.

`killTree` now resolves the tree through MSYS's own process table — which does
keep the logical parentage — **before** killing, since the taskkill destroys the
only link back to our shell, then verifies each descendant is gone and kills the
survivors directly. Both suites now leak 0. A process that had already exited on
its own is recognized as success, not retried and not reported.

Teardown remains total by construction: nothing here throws, because a throwing
kill would strand a run mid-flight with its readers parked. That makes an
unkillable process otherwise invisible, so `localProcessSandbox` accepts a
`logger`:

```ts
const dev = localProcessSandbox({
  logger: { warn: (message, meta) => console.warn(message, meta) },
})
```

Any object with a `warn(message, meta?)` method satisfies the new
`LocalProcessLogger`, including the `InternalLogger` an adapter already holds.

Nothing changes on POSIX, where `sh` really is the command's parent and
signalling the wrapper suffices.
