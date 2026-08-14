---
title: Branch From a Version
id: portable-snapshots-fork
order: 13
description: "Copy one selected checkpoint into an empty thread without changing the source thread."
---

A user wants to try a new idea from an older workspace. The original thread
must stay unchanged. `snapshots.fork` copies one selected checkpoint into an
empty destination thread.

The method copies the checkpoint that you pass. It does not copy the latest
checkpoint unless that id is the one you pass.

Your checkpoint store must implement `forkFromCheckpoint`. That operation must
copy these items in one step:

- The selected checkpoint.
- The conversation.
- The destination head.
- The blob reference counts.

The store must reject a destination thread that already has persisted state.

Keep this route on the server. Make sure that the session can access the source
thread. Make sure that the session can create the destination thread. Then call
`snapshots.fork`.

```ts
import { requireSession } from './auth'
import { snapshots } from './sandbox-server'

export async function POST(request: Request) {
  const session = await requireSession(request)
  const { threadId, checkpointId, destinationThreadId } = await request.json()

  if (
    typeof threadId !== 'string' ||
    typeof checkpointId !== 'string' ||
    typeof destinationThreadId !== 'string'
  ) {
    return new Response('Invalid request', { status: 400 })
  }
  if (!(await session.canAccessThread(threadId))) {
    return new Response('Not found', { status: 404 })
  }
  if (!(await session.canCreateThread(destinationThreadId))) {
    return new Response('Not found', { status: 404 })
  }

  const checkpoint = await snapshots.fork({
    threadId,
    checkpointId,
    destinationThreadId,
  })

  return Response.json({ checkpointId: checkpoint.id })
}
```

The client sends its request to this route. It does not call `snapshots.fork`.

```ts
export async function forkCheckpoint(
  threadId: string,
  checkpointId: string,
  destinationThreadId: string,
) {
  const response = await fetch('/api/snapshots/fork', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      threadId,
      checkpointId,
      destinationThreadId,
    }),
  })
  if (!response.ok) throw new Error('Could not fork checkpoint')
  return response.json()
}
```

Use the same authorization rule for both threads. A client-selected checkpoint
id is not proof of access.

## See it in the example

The React chat example has an App Studio page at `/app-studio`. That page
starts from one prompt, shows a live preview, then lets you fork the chat or
compare two directions.

1. Open `examples/ts-react-chat`.
2. Set `XAI_API_KEY` and start Docker.
3. Run `pnpm dev` and open `/app-studio`.
4. Build an app. Then use **Fork chat** or **Compare two directions**.

When you select **Compare two directions** and submit, the page calls
`/api/app-studio-fork` with `count: 2`. Each fork gets a new sandbox and the
saved files from the source thread. The agent installs dependencies if
`node_modules` is missing, then starts a preview. Each pane shows its own
preview URL. You keep one branch. The source thread stays unchanged.

See [App Studio](../../examples/ts-react-chat/README.md#app-studio)
in the example README. The page path is `/app-studio`.

If you use SQLite, put the fork in one transaction. That transaction must copy
the source conversation and reject a destination thread that is not empty. See
[Keep Files After Reload](./portable-snapshots-configure).

When the agent must call fork itself, use
[Let the Agent Save and Fork](./portable-snapshots-tools).
