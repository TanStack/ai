---
title: What a Snapshot Stores
id: portable-snapshots-safety
order: 16
description: "See which workspace paths a portable snapshot stores, and how capture treats secrets and unsafe files."
---

You do not want secrets, git metadata, or install trees in durable storage. The
default snapshot policy excludes those paths. When a capture or restore finds
an unsafe filesystem entry, it stops.

Portable snapshots store regular files and directories only. When a capture or
restore finds a symlink, an executable file, or a special filesystem entry, it
fails.

## Default exclusions

The default policy excludes these path segments at every depth:

- `.git`
- `node_modules`
- `.env*`

It also excludes these exact paths:

- The projection marker, `.tanstack-projected-<workspaceHash>`, at the
  workspace root only.
- `CLAUDE.md` and `GEMINI.md` at the workspace root.
- Direct `.claude/skills/<name>`, `.codex/skills/<name>`, and
  `.grok/skills/<name>` paths.

These exclusions use paths for regular files and copied files too.

## Replace the default policy

To keep only some files, or one file, see
[Pick Which Files to Keep](./portable-snapshots-files). Copy
`defaultSandboxSnapshotPolicy()` first. Then add `include`, `exclude`, or
`redact`.

```ts
import { defaultSandboxSnapshotPolicy } from '@tanstack/ai-sandbox'

const policy = {
  ...defaultSandboxSnapshotPolicy(),
  redact({ bytes }: { bytes: Uint8Array }) {
    return bytes
  },
}
```

When you create the snapshots object, pass `policy`. See
[Keep Files After Reload](./portable-snapshots-configure).

The exact projection marker for the workspace stays protected. A custom policy
cannot capture or restore that marker.

## Secrets

Resolved secret values are replaced with zero bytes before the content is
hashed or stored.

## Restore safety

An invalid manifest, a missing blob, or changed blob content stops the restore
before it writes the workspace. The failed private sandbox is then discarded.
Your existing resumed sandbox stays unchanged.

See [Providers](./providers) for provider-native snapshot and resume support.
