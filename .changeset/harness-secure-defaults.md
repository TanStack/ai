---
'@tanstack/ai-harness': patch
---

Make the transport defaults safe for a server with many instances.

- `createHarnessHandler` and `handleHarnessSocket` read the user of each request with the host `access`. On a host without `access`, pass `openAccess: true` (no user) or `openAccess: { principal }` (one local user), else they throw at the start. So a server never serves every thread to everyone by mistake.
- `media: { secret }` signs the media URLs of `createHarnessHandler`. Set the same secret on every instance, so a media URL that one instance signs works on every instance. Without it, the handler signs with a random key of its own, and a URL works only on that instance. A signed URL names its user, and the handler checks that user again when it serves the file.
- `oauthConnector` needs `login`. Use `'device'` on a server, and `'loopback'` only for a harness on the user's own machine, such as a CLI.
