---
title: What a Snapshot Stores
id: portable-snapshots-safety
order: 16
description: "See which workspace paths a portable snapshot stores, and how capture treats secrets and unsafe files."
---

The default snapshot policy excludes secrets, git metadata, and install trees. A capture or restore stops when it finds an unsafe filesystem entry.

Portable snapshots store regular files with their permission bits,
directories, and symlinks. A capture fails with `SandboxSnapshotError` code
`SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY` when it finds one of these entries:

- A symlink whose target is outside the workspace.
- A fifo, a socket, or a device file.

A restore fails with the same code when the destination workspace has a fifo,
a socket, or a device file.

Add the path to `policy.exclude`. The policy runs before this check, so an
excluded path never fails. See
[Skip a link that leaves the workspace](./portable-snapshots-files#skip-a-link-that-leaves-the-workspace).

## When `withSandbox` writes a checkpoint

- **A run finishes.** The checkpoint is written after persistence saves the
  conversation.
- **A run fails or is aborted.** The checkpoint is written while the sandbox
  files still exist. This capture is best effort. A failed capture is logged
  as a warning, and the run keeps its own error.
- **A run pauses at an interrupt.** No checkpoint is written, because the run
  is not done.

To write a checkpoint at another time, see
[Checkpoint at Any Time](./portable-snapshots-checkpoints).

## Executable files and links

- **Permission bits.** A capture saves the permission bits of each file. A
  restore sets them again with `chmod`, so a script such as `gradlew` still
  runs.
- **Links.** A capture saves each symlink with its target text. A restore
  makes the link again with `ln -s`. A target inside the workspace can be
  missing.
- **Provider needs.** The provider must implement `fs.lstat`. Without it, a
  capture or restore fails with code `SANDBOX_SNAPSHOT_LSTAT_REQUIRED`. The
  capture runs `readlink`, and the restore runs `ln -s` and `chmod`, through
  `process.exec`.

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
[Pick Which Files to Keep](./portable-snapshots-files). If you pass only
`include` or only `redact`, the default exclusions stay in place. If you
pass `exclude`, copy `defaultSandboxSnapshotPolicy()` first. Then add your
rules.

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
