---
title: Pick Which Files to Keep
id: portable-snapshots-files
order: 15
description: "Pass include and exclude functions so a portable snapshot stores only the files you choose, including a single file."
---

You have portable snapshots wired. The agent writes a full workspace. You do
not want every file in durable storage.

Pass a `policy` when you create the snapshots object. `include` and `exclude`
are functions. They decide which workspace paths the capture stores. The same
policy runs on automatic save, named save, and restore.

This page assumes you already created a snapshots object. If you have not, start
with [Keep Files After Reload](./portable-snapshots-configure).

## Copy the default policy first

A custom policy replaces the default exclusions. Copy
`defaultSandboxSnapshotPolicy()` first. Then add your rules.

```ts
import { defaultSandboxSnapshotPolicy } from '@tanstack/ai-sandbox'

const defaults = defaultSandboxSnapshotPolicy()

const policy = {
  ...defaults,
  include(path: string) {
    return path === 'src' || path.startsWith('src/')
  },
}
```

If you pass only `include` or only `redact`, capture also stores `.env`,
`.git`, and `node_modules`.

The projection marker for this workspace stays protected. A custom policy
cannot capture or restore that marker.

## Pass the policy

Pass `policy` to `memorySandboxSnapshots` or `createSandboxSnapshots`. Use that
same object in `withSandbox`.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withPersistence } from '@tanstack/ai-persistence'
import {
  defaultSandboxSnapshotPolicy,
  defineSandbox,
  defineWorkspace,
  InMemorySandboxInstanceStore,
  memorySandboxSnapshots,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const instances = new InMemorySandboxInstanceStore()

const sandbox = defineSandbox({
  id: 'app-builder',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({ source: { type: 'none' } }),
  lifecycle: { reuse: 'thread' },
})

const defaults = defaultSandboxSnapshotPolicy()

const snapshots = await memorySandboxSnapshots({
  sandbox,
  instances,
  policy: {
    ...defaults,
    include(path: string) {
      return path === 'src' || path.startsWith('src/')
    },
  },
})

const result = chat({
  threadId: 'app-thread',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'Create a landing page.' }],
  middleware: [
    withPersistence(snapshots.persistence),
    withSandbox(sandbox, { instances, snapshots }),
  ],
})

void result
```

`snapshots.save` has no file list. Change the file set by changing `policy` on
the snapshots object.

## How include and exclude run

Each path is a workspace-relative string such as `src/app.ts`. `kind` is
`file` or `dir`.

1. The projection marker is skipped.
2. If `exclude(path, kind)` returns true, the path is skipped. For a
   directory, the whole tree under it is skipped.
3. For a file, `include(path, 'file')` must return true. If you omit
   `include`, every file that is not excluded is stored.
4. Capture then walks parent directories so a nested file can still match.

`exclude` wins. `include: () => true` cannot keep a path that `exclude`
rejects.

Capture does not read a file that the policy skips.

## Keep one file

Return true only for that path. Capture still walks parent directories.

```ts
const defaults = defaultSandboxSnapshotPolicy()

const policy = {
  ...defaults,
  include(path: string) {
    return path === 'src/app.ts'
  },
}
```

## Keep a few files

```ts
const defaults = defaultSandboxSnapshotPolicy()
const keep = new Set(['package.json', 'src/app.ts', 'src/index.ts'])

const policy = {
  ...defaults,
  include(path: string) {
    return keep.has(path)
  },
}
```

## Keep one folder

```ts
const defaults = defaultSandboxSnapshotPolicy()

const policy = {
  ...defaults,
  include(path: string) {
    return path === 'src' || path.startsWith('src/')
  },
}
```

## Keep files by suffix

Allow directories so the walk can reach nested files. Then match the suffix.

```ts
const defaults = defaultSandboxSnapshotPolicy()

const policy = {
  ...defaults,
  include(path: string, kind: 'file' | 'dir') {
    return kind === 'dir' || path.endsWith('.ts')
  },
}
```

## Skip one extra folder

Keep the default `exclude`. Then add your folder.

```ts
const defaults = defaultSandboxSnapshotPolicy()

const policy = {
  ...defaults,
  exclude(path: string, kind: 'file' | 'dir') {
    if (defaults.exclude?.(path, kind)) return true
    return path === 'dist' || path.startsWith('dist/')
  },
}
```

To skip a folder name at every depth, match a path segment:

```ts
exclude(path: string, kind: 'file' | 'dir') {
  if (defaults.exclude?.(path, kind)) return true
  return path.split('/').includes('dist')
}
```

## What the policy does not filter

The file policy applies to workspace files and empty directories only.

- The checkpoint still stores the full conversation for the thread.
- The checkpoint still copies every generated artifact for the thread.

See [What a Snapshot Stores](./portable-snapshots-safety) for secrets, default
exclusions, and restore safety.

## Restore

Restore uses the same policy. Files that the policy does not include stay on
the destination disk. Restore does not delete those files.

Automatic restore still writes the latest checkpoint into a new private
sandbox. It does not write into a live resumed sandbox.
