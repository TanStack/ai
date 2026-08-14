---
title: Portable Sandbox Snapshots
id: portable-snapshots
order: 10
description: "Keep completed sandbox files after the provider sandbox is gone, then rebuild them in a new sandbox."
---

An agent can finish work in a sandbox, then the sandbox can disappear. A reload
or a later run starts with an empty workspace. Portable snapshots store the
finished files in your persistence. A later run restores them into a new
sandbox.

This work runs on the server. Your client calls routes that you own.

## Pick your path

- You want files to return after a reload. Read
  [Keep Files After Reload](./portable-snapshots-configure).
- You want a user to mark one version. Read
  [Save a Named Version](./portable-snapshots-save).
- You want a user to branch from one version. Read
  [Branch From a Version](./portable-snapshots-fork).
- You want a user to download a generated file. Read
  [Send a Frozen File](./portable-snapshots-artifacts).
- You want to control which paths are stored. Read
  [What a Snapshot Stores](./portable-snapshots-safety).

## What a checkpoint holds

After a successful terminal run, the middleware waits for persistence to save
the conversation. It then writes one checkpoint for the thread.

A checkpoint holds:

- Regular workspace files.
- Empty directories.
- Generated artifacts that already belong to the thread.
- The saved conversation for the thread.

File data and artifact data use separate content-addressed blob namespaces.
Equal file data shares one file blob. Equal artifact data shares one artifact
blob. Unused blobs stay until you delete them.

## When a later run restores files

A later run restores the latest checkpoint only into a new private sandbox. The
restore runs after bootstrap and before hooks or the harness see the sandbox.

A live resumed sandbox keeps its current files. Portable snapshots do not write
into that sandbox. Provider-native snapshots make bootstrap faster. See
[Lifecycle & Snapshots](./lifecycle).

A named checkpoint stays available for a read or a selected fork. Automatic
restore still uses the latest checkpoint.

The conversation comes from the durable message store. The sandbox journal is a
run-output log. When you need to replay agent output, see
[The Run Journal](./journal).

## Who calls the methods

`createSandboxSnapshots` and `memorySandboxSnapshots` return one object. That
object has `save`, `fork`, and `readArtifact`. Call those methods on the server
after you make sure that the session can access the thread.

Do not treat a checkpoint id, a thread id, or an artifact id as proof of access.
