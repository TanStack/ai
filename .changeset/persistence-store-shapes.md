---
'@tanstack/ai-persistence': patch
---

`InboxStore.get`, `markApplied`, and `markRejected` take the thread id first, so a store can key an entry by thread and input id. `WorkClaimStore.get(threadId)` returns the owner of a claim and when it expires. The session store docs allow a content-hash revision (an ETag of S3 or Netlify Blobs) that comes back for the same entry.
