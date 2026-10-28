---
title: Send a Frozen File
id: portable-snapshots-artifacts
order: 14
description: "Serve copied artifact bytes from one checkpoint through an authorized server route."
---

`snapshots.readArtifact` reads the bytes of one file from a checkpoint. Return those bytes from your route.

The method makes sure that the checkpoint belongs to the supplied thread. Your
route must still authorize that thread first. The method returns metadata and
`Uint8Array` bytes. It does not create an HTTP response.

Keep this route on the server. If the session cannot access the thread, return
404. Then call `snapshots.readArtifact`.

```ts
import { requireSession } from './auth'
import { snapshots } from './sandbox-server'

export async function GET(request: Request) {
  const session = await requireSession(request)
  const url = new URL(request.url)
  const threadId = url.searchParams.get('threadId')
  const checkpointId = url.searchParams.get('checkpointId')
  const artifactId = url.searchParams.get('artifactId')

  if (!threadId || !checkpointId || !artifactId) {
    return new Response('Not found', { status: 404 })
  }
  if (!(await session.canAccessThread(threadId))) {
    return new Response('Not found', { status: 404 })
  }

  const { artifact, bytes } = await snapshots.readArtifact({
    threadId,
    checkpointId,
    artifactId,
  })
  return new Response(bytes.slice(), {
    headers: {
      'content-type': artifact.mimeType,
      'content-length': String(artifact.size),
    },
  })
}
```

The client uses the authorized route as an artifact URL. It must not read the
blob store or call `snapshots.readArtifact` in the browser.

```ts
export function snapshotArtifactUrl(
  threadId: string,
  checkpointId: string,
  artifactId: string,
) {
  const query = new URLSearchParams({ threadId, checkpointId, artifactId })
  return `/api/snapshots/artifact?${query}`
}
```

A named save copies thread artifacts into the checkpoint. Automatic restore
does not change those copied bytes. See
[Save a Named Version](./portable-snapshots-save) and
[What a Snapshot Stores](./portable-snapshots-safety).
