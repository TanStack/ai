---
'@tanstack/ai-sandbox-blaxel': minor
---

Add `@tanstack/ai-sandbox-blaxel`, a sandbox provider backed by managed Blaxel
sandboxes. It implements the `SandboxProvider` / `SandboxHandle`
contract: native filesystem reads and writes, `fs.watch()` without polling,
commands with separate stdout and stderr, live bounded background-process
output, per-port preview URLs, `env` injection, and resume-by-id. Process stdout
and stderr are byte-bounded through remotely supervised 8 MiB capture pipelines
and sent live as fixed-size base64 records, preventing the pinned SDK from
accumulating unbounded cumulative or newline-free logs while retaining exact
bytes and the framework's line-stream contract.

Blaxel's source-scoped snapshot/fork API is currently a private preview, has
no entitlement probe, and does not document snapshots surviving source deletion.
The provider therefore keeps the framework's `snapshots`, `fork`, and
`restoreSnapshot` surface disabled rather than claiming reconstruct-after-delete
semantics it cannot guarantee.

Created sandboxes carry a `1h` TTL by default so an abandoned run cannot strand
a paid sandbox; pass `ttl: null` to manage lifetime yourself. Previews are
token-gated by default, and the returned channel reports both the token and the
ready-to-send `X-Blaxel-Preview-Token` header.

A spawned process reports termination honestly: if `kill()` cannot reap the
remote process group, `wait()` rejects with that failure instead of resolving
the kill exit code, so a sandbox that is still running and still billing cannot
hide behind a clean exit. A stream that already failed is reported for the same
reason. `fs.write()` creates missing parent directories, and `fork()` throws
`UnsupportedCapabilityError` rather than being absent.
