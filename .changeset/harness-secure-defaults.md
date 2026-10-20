---
'@tanstack/ai-harness': patch
---

Make the transport defaults safe for a server with many instances.

- `createHarnessHandler` and `handleHarnessSocket` read the user of each request with the host `access`. On a host without `access`, pass `openAccess: true` (no user) or `openAccess: { user }` (one local user), else they throw at the start. So a server never serves every thread to everyone by mistake.
- `media: { secret }` signs the media URLs of `createHarnessHandler`. Set the same secret on every instance, so a media URL that one instance signs works on every instance. Without it, the handler signs with a random key of its own, and a URL works only on that instance. A host with `ownership` options needs `media`, else the handler throws at the start. On another host without `media`, the first handler logs one warning. A signed URL names its harness and its user, and the handler checks that user again when it serves the file. A URL of a deleted thread answers 404.
- `media: { keys: [newKey, oldKey] }` rotates the key: the first key signs, and every key checks. Each key must be at least 32 bytes, else the handler throws at the start.
- `oauthConnector` needs `login`. Use `'device'` on a server, and `'loopback'` only for a harness on the user's own machine, such as a CLI.
