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

Start with persistence. Then add a product page only when you need that action.

| You have | You want | Required pages |
| --- | --- | --- |
| No persistence yet | Files come back after a reload | [Keep Files After Reload](./portable-snapshots-configure#create-new-persistence) |
| Chat persistence already | Files come back after a reload | [Keep Files After Reload](./portable-snapshots-configure#reuse-existing-persistence) |
| Snapshots already wired | A user marks one version | [Save a Named Version](./portable-snapshots-save) |
| Snapshots already wired | A user branches from one version | [Branch From a Version](./portable-snapshots-fork) |
| Snapshots already wired | A user downloads a generated file | [Send a Frozen File](./portable-snapshots-artifacts) |
| Snapshots already wired | The agent saves or forks this thread | [Let the Agent Save and Fork](./portable-snapshots-tools) |
| Snapshots already wired | Custom include or redact rules | [What a Snapshot Stores](./portable-snapshots-safety) |

Automatic save and restore needs only the configure page. Save, fork, download,
and policy pages are extra.

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
