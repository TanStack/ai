---
'@tanstack/ai-harness': patch
---

Make the transport defaults safe for a server with many instances.

- `createHarnessHandler` and `handleHarnessSocket` read the user of each request with the host `access`. On a host without `access`, pass `openAccess: true` (no user) or `openAccess: { principal }` (one local user), else they throw at the start. So a server never serves every thread to everyone by mistake.
- On a durable host (`stores.log`), `createHarnessHandler` throws without `media: { secret }`, so a media URL that one instance signs works on every instance. A signed URL names its user, and the handler checks that user again when it serves the file.
- `oauthConnector` needs `login`. Use `'device'` on a server, and `'loopback'` only for a harness on the user's own machine, such as a CLI.
