---
title: Save a Named Version
id: portable-snapshots-save
order: 12
description: "Let a user mark one live sandbox workspace as a named checkpoint."
---

Automatic saves protect each completed run. A user can also mark one workspace
state, such as a release candidate. `snapshots.save` captures that live
sandbox into a named checkpoint.

The method needs a live, reusable sandbox for the thread. A lifecycle with
`reuse: 'none'` cannot create a named checkpoint.

Keep this route on the server. Read the owner from the session. If the owner
cannot access the thread, return 404. Then call `snapshots.save`.

When you create the snapshots object, bind `sandbox` and `instances`. You can
also pass them on `save`. Use the same instance store that `withSandbox` uses.
See [Keep Files After Reload](./portable-snapshots-configure).

```ts
import { requireSession } from './auth'
import { snapshots } from './sandbox-server'

export async function POST(request: Request) {
  const session = await requireSession(request)
  const { threadId, runId, label } = await request.json()

  if (
    typeof threadId !== 'string' ||
    typeof runId !== 'string' ||
    typeof label !== 'string'
  ) {
    return new Response('Invalid request', { status: 400 })
  }
  if (!(await session.canAccessThread(threadId))) {
    return new Response('Not found', { status: 404 })
  }

  const checkpoint = await snapshots.save({
    threadId,
    runId,
    label,
    tenant: { userId: session.userId },
  })
  return Response.json({ checkpointId: checkpoint.id, label: checkpoint.label })
}
```

The client sends its request to this route. It does not call `snapshots.save`
or read the persistence stores.

```ts
export async function saveCheckpoint(
  threadId: string,
  runId: string,
  label: string,
) {
  const response = await fetch('/api/snapshots/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ threadId, runId, label }),
  })
  if (!response.ok) throw new Error('Could not save checkpoint')
  return response.json()
}
```

A named checkpoint stays available for a read or a selected fork. Automatic
restore still uses the latest checkpoint. See
[Branch From a Version](./portable-snapshots-fork) to copy one selected
checkpoint into a new thread.
